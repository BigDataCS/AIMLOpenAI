/**
 * The VaultMind agent mesh.
 *
 * Ingestion runs a pipeline of specialised agents, each of which records its own
 * run (engine, latency, confidence) so the UI can show *why* the vault decided
 * what it decided. Every agent degrades gracefully: if the LLM is unavailable or
 * returns junk, the deterministic local implementation still produces an answer.
 *
 *   Extractor  -> text + page count
 *   Classifier -> category / subcategory / confidence
 *   Entity     -> money, dates, parties, identifiers
 *   Summarizer -> executive summary + plain-language explainer
 *   Indexer    -> FTS5 rows + chunk embeddings
 *   Compliance -> sensitivity tier + PII inventory
 *   Deadline   -> expiry detection + reminder creation
 *   Profile    -> harvests reusable fields for autofill
 */
import { nanoid } from "nanoid";
import { db, nowIso, audit } from "../db";
import * as L from "../ai/local";
import { llmJson, llmText, engineName } from "../ai/engine";

export type AgentRun = {
  id: string;
  agent: string;
  status: "ok" | "skipped" | "error";
  engine: string;
  ms: number;
  confidence?: number;
  output?: any;
};

function record(docId: string | null, agent: string, status: string, engine: string, ms: number, output: any, confidence?: number) {
  db()
    .prepare(
      "INSERT INTO agent_runs (id, doc_id, agent, status, input, output, engine, ms, confidence, started_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(nanoid(10), docId, agent, status, null, JSON.stringify(output ?? null), engine, Math.round(ms), confidence ?? null, nowIso());
}

// ───────────────────────── classifier agent ─────────────────────────

export async function classifierAgent(docId: string, text: string, filename: string) {
  const t0 = performance.now();
  const local = L.classify(text, filename);
  let result = { ...local, engine: "local" as string };

  const llm = await llmJson<{ category: string; subcategory: string; confidence: number; title: string }>({
    system:
      "You classify personal/business documents. Reply with JSON: {category, subcategory, confidence (0-1), title}. " +
      "category must be one of: Financial, Legal, Identity, Insurance, Medical, Property, Employment, Education, Tax, Vehicle, Utilities, Receipts, Unsorted.",
    user: `Filename: ${filename}\n\n${text.slice(0, 6000)}`,
    maxTokens: 200,
  });
  if (llm?.category) {
    result = {
      category: llm.category as L.Category,
      subcategory: llm.subcategory || local.subcategory,
      confidence: typeof llm.confidence === "number" ? llm.confidence : local.confidence,
      runnerUp: local.runnerUp,
      signals: local.signals,
      engine: "openai",
    };
  }
  const ms = performance.now() - t0;
  record(docId, "classifier", "ok", result.engine, ms, result, result.confidence);
  return result;
}

// ───────────────────────── entity agent ─────────────────────────

export async function entityAgent(docId: string, text: string) {
  const t0 = performance.now();
  const ents = L.extractEntities(text);

  // The LLM is good at parties/subjects that regexes miss; merge, never replace.
  const llm = await llmJson<{ entities: { kind: string; value: string }[] }>({
    system:
      "Extract key entities from the document. JSON: {entities:[{kind,value}]}. " +
      "kind ∈ person, organization, address, account_number, policy_number, invoice_number, date, money, id_number, other. Max 20.",
    user: text.slice(0, 6000),
    maxTokens: 500,
  });
  if (llm?.entities?.length) {
    for (const e of llm.entities) {
      if (!e?.value) continue;
      const dup = ents.some((x) => x.kind === e.kind && x.value.toLowerCase() === String(e.value).toLowerCase());
      if (!dup) ents.push({ kind: e.kind || "other", value: String(e.value), confidence: 0.75 });
    }
  }

  const d = db();
  d.prepare("DELETE FROM entities WHERE doc_id = ?").run(docId);
  const ins = d.prepare("INSERT INTO entities (doc_id, kind, value, normalized, confidence) VALUES (?,?,?,?,?)");
  for (const e of ents) ins.run(docId, e.kind, e.value, e.normalized ?? null, e.confidence);

  const ms = performance.now() - t0;
  record(docId, "entity-extractor", "ok", llm ? "openai" : "local", ms, { count: ents.length });
  return ents;
}

// ───────────────────────── summarizer agent ─────────────────────────

export async function summarizerAgent(docId: string, text: string, cls: L.Classification, ents: L.Entity[]) {
  const t0 = performance.now();
  const summary = L.summarize(text, 3);
  let plain = L.plainLanguage(text, cls, ents);
  let engine = "local";

  const llm = await llmText({
    system:
      "You explain documents to a non-expert. Use short sentences, no legalese. " +
      "Structure: **What it is**, **Who's involved**, **What you must do**, **Dates & money that matter**, **Watch out for**. Markdown, under 220 words.",
    user: text.slice(0, 8000),
    maxTokens: 500,
  });
  if (llm && llm.length > 80) {
    plain = llm;
    engine = "openai";
  }

  const r = L.readability(text);
  const ms = performance.now() - t0;
  record(docId, "summarizer", "ok", engine, ms, { grade: r.grade, level: r.level });
  return { summary, plain, readability: r };
}

// ───────────────────────── indexer agent ─────────────────────────

export function indexerAgent(docId: string, title: string, text: string, tags: string[], ents: L.Entity[]) {
  const t0 = performance.now();
  const d = db();

  d.prepare("INSERT OR REPLACE INTO doc_text (doc_id, body) VALUES (?,?)").run(docId, text);
  d.prepare("DELETE FROM doc_fts WHERE doc_id = ?").run(docId);
  d.prepare("INSERT INTO doc_fts (doc_id, title, body, tags, entities) VALUES (?,?,?,?,?)").run(
    docId,
    title,
    text,
    tags.join(" "),
    ents.map((e) => e.value).join(" ")
  );

  d.prepare("DELETE FROM chunks WHERE doc_id = ?").run(docId);
  const parts = L.chunk(text);
  const ins = d.prepare("INSERT INTO chunks (doc_id, ord, text, vector) VALUES (?,?,?,?)");
  parts.forEach((p, i) => ins.run(docId, i, p, JSON.stringify(L.embed(p))));

  const ms = performance.now() - t0;
  record(docId, "indexer", "ok", "local", ms, { chunks: parts.length, chars: text.length });
  return { chunks: parts.length };
}

// ───────────────────────── compliance agent ─────────────────────────

const PII_PATTERNS: { kind: string; re: RegExp; tier: number }[] = [
  { kind: "Government ID", re: /\b\d{3}-\d{2}-\d{4}\b|\bSSN\b|\bSIN\b|\bsocial security\b/i, tier: 3 },
  { kind: "Payment card", re: /\b(?:\d[ -]?){13,16}\b/, tier: 3 },
  { kind: "Bank account", re: /\b(?:IBAN|routing|account\s*(?:no|number|#))\b/i, tier: 3 },
  { kind: "Health data", re: /\b(diagnosis|prescription|patient|medical record|blood|dosage)\b/i, tier: 3 },
  { kind: "Date of birth", re: /\b(date of birth|dob|born on)\b/i, tier: 2 },
  { kind: "Home address", re: /\b\d{1,5}\s+[A-Z][A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln)\b/, tier: 2 },
  { kind: "Contact details", re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/, tier: 1 },
  { kind: "Salary / compensation", re: /\b(salary|compensation|gross pay|net pay)\b/i, tier: 2 },
];

export function complianceAgent(docId: string, text: string, category: string) {
  const t0 = performance.now();
  const found = PII_PATTERNS.filter((p) => p.re.test(text)).map((p) => ({ kind: p.kind, tier: p.tier }));
  const maxTier = found.reduce((a, f) => Math.max(a, f.tier), 0);
  const categoryFloor = ["Identity", "Medical", "Tax", "Financial"].includes(category) ? 2 : 0;
  const tier = Math.max(maxTier, categoryFloor);
  const sensitivity = tier >= 3 ? "restricted" : tier === 2 ? "confidential" : tier === 1 ? "internal" : "public";

  const ms = performance.now() - t0;
  record(docId, "compliance", "ok", "local", ms, { sensitivity, pii: found });
  return { sensitivity, pii: found };
}

// ───────────────────────── deadline agent ─────────────────────────

export function deadlineAgent(docId: string, title: string, text: string, category: string) {
  const t0 = performance.now();
  const hit = L.findExpiry(text);
  let created: string | null = null;

  if (hit) {
    const leadMap: Record<string, number> = { Identity: 90, Insurance: 45, Legal: 30, Vehicle: 30, Tax: 21, Property: 45 };
    const lead = leadMap[category] ?? 30;
    const id = nanoid(12);
    db()
      .prepare(
        "INSERT INTO reminders (id, doc_id, title, kind, due_date, lead_days, status, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
      )
      .run(
        id,
        docId,
        `${title} — ${hit.cue.includes("renew") ? "renewal" : "expires"}`,
        hit.cue.includes("due") ? "payment" : "expiry",
        hit.date,
        lead,
        "open",
        `Detected from the phrase "${hit.cue}" in the document.`,
        nowIso()
      );
    created = id;
  }

  const ms = performance.now() - t0;
  record(docId, "deadline-watcher", hit ? "ok" : "skipped", "local", ms, hit ?? { reason: "no expiry cue found" });
  return { expiresAt: hit?.date ?? null, reminderId: created };
}

// ───────────────────────── profile / autofill agent ─────────────────────────

const PROFILE_MAP: { key: string; label: string; kinds: string[]; re?: RegExp }[] = [
  { key: "full_name", label: "Full name", kinds: ["person"] },
  { key: "email", label: "Email", kinds: ["email"] },
  { key: "phone", label: "Phone", kinds: ["phone"] },
  { key: "address", label: "Address", kinds: ["address"] },
  { key: "employer", label: "Employer", kinds: ["organization"] },
  { key: "policy_number", label: "Policy number", kinds: ["policy_number"] },
  { key: "account_number", label: "Account number", kinds: ["account_number"] },
  { key: "vin", label: "Vehicle VIN", kinds: ["vin"] },
];

export function profileAgent(docId: string, ents: L.Entity[]) {
  const t0 = performance.now();
  const d = db();
  const learned: string[] = [];
  // Role addresses (claims@, hr@, noreply@) belong to the sender, not the owner.
  const ROLE_EMAIL = /^(claims|hr|info|support|billing|noreply|no-reply|admin|contact|enquiries|service|help|sales|leasing|passports|warranty)@/i;
  for (const field of PROFILE_MAP) {
    const hit = ents
      .filter((e) => field.kinds.includes(e.kind))
      .filter((e) => !(field.key === "email" && ROLE_EMAIL.test(e.value)))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (!hit) continue;
    const existing = d.prepare("SELECT confidence FROM form_profile WHERE key = ?").get(field.key) as { confidence: number } | undefined;
    if (existing && existing.confidence >= hit.confidence) continue;
    d.prepare(
      "INSERT INTO form_profile (key, value, source_doc, confidence, updated_at) VALUES (?,?,?,?,?) " +
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, source_doc=excluded.source_doc, confidence=excluded.confidence, updated_at=excluded.updated_at"
    ).run(field.key, hit.value, docId, hit.confidence, nowIso());
    learned.push(field.key);
  }
  const ms = performance.now() - t0;
  record(docId, "profile-builder", learned.length ? "ok" : "skipped", "local", ms, { learned });
  return learned;
}

// ───────────────────────── tag agent ─────────────────────────

export function tagAgent(docId: string, text: string, cls: L.Classification, ents: L.Entity[]) {
  const t0 = performance.now();
  const toks = L.tokens(text);
  const freq = new Map<string, number>();
  for (const t of toks) freq.set(t, (freq.get(t) || 0) + 1);

  const keywords = [...freq.entries()]
    .filter(([w, c]) => c >= 2 && w.length > 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  const tags = new Set<string>([cls.category.toLowerCase()]);
  if (cls.subcategory) tags.add(cls.subcategory.toLowerCase().replace(/\s+/g, "-"));
  const org = ents.find((e) => e.kind === "organization");
  if (org) tags.add(org.value.toLowerCase().split(/\s+/).slice(0, 2).join("-"));
  const year = ents.find((e) => e.kind === "date" && e.normalized)?.normalized?.slice(0, 4);
  if (year) tags.add(year);
  for (const k of keywords) tags.add(k);

  const d = db();
  d.prepare("DELETE FROM tags WHERE doc_id = ? AND source = 'ai'").run(docId);
  const ins = d.prepare("INSERT OR IGNORE INTO tags (doc_id, tag, source) VALUES (?,?,'ai')");
  const list = [...tags].slice(0, 10);
  for (const t of list) ins.run(docId, t);

  const ms = performance.now() - t0;
  record(docId, "tagger", "ok", "local", ms, { tags: list });
  return list;
}

// ───────────────────────── orchestrator ─────────────────────────

export async function runIngestPipeline(opts: {
  docId: string;
  title: string;
  filename: string;
  text: string;
  extractMethod: string;
}) {
  const { docId, title, filename, text } = opts;
  const d = db();
  const t0 = performance.now();

  if (!text.trim()) {
    d.prepare("UPDATE documents SET status='needs-ocr', updated_at=? WHERE id=?").run(nowIso(), docId);
    record(docId, "orchestrator", "skipped", engineName(), performance.now() - t0, { reason: "no text layer" });
    audit("ingest.needs_ocr", { docId });
    return { status: "needs-ocr" as const };
  }

  const cls = await classifierAgent(docId, text, filename);
  const ents = await entityAgent(docId, text);
  const sum = await summarizerAgent(docId, text, cls as any, ents);
  const tags = tagAgent(docId, text, cls as any, ents);
  indexerAgent(docId, title, text, tags, ents);
  const comp = complianceAgent(docId, text, cls.category);
  const dl = deadlineAgent(docId, title, text, cls.category);
  profileAgent(docId, ents);

  // roll the structured findings back onto the document row
  const primary = L.primaryAmount(text);
  const amount = primary?.value ?? null;
  const docDate = ents.filter((e) => e.kind === "date" && e.normalized).map((e) => e.normalized!).sort()[0] ?? null;
  const issuer = ents.find((e) => e.kind === "organization")?.value ?? null;

  d.prepare(
    `UPDATE documents SET category=?, subcategory=?, summary=?, plain_summary=?, sensitivity=?, confidence=?,
       issuer=?, doc_date=?, expires_at=?, amount=?, currency=?, status='ready', updated_at=? WHERE id=?`
  ).run(
    cls.category,
    cls.subcategory ?? null,
    sum.summary,
    sum.plain,
    comp.sensitivity,
    cls.confidence,
    issuer,
    docDate,
    dl.expiresAt,
    amount,
    amount ? "USD" : null,
    nowIso(),
    docId
  );

  const ms = performance.now() - t0;
  record(docId, "orchestrator", "ok", engineName(), ms, {
    category: cls.category,
    sensitivity: comp.sensitivity,
    reminder: !!dl.reminderId,
  });
  audit("ingest.complete", { docId, detail: `${cls.category} · ${comp.sensitivity} · ${Math.round(ms)}ms` });

  return { status: "ready" as const, category: cls.category, ms };
}
