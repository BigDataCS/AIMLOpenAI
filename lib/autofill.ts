/**
 * Automatic form filling.
 *
 * The profile agent harvests reusable facts during ingestion. Here we match an
 * arbitrary form's fields to those facts by label similarity, and report where
 * each value came from so nothing is filled in blind.
 */
import { db } from "./db";

export type FormField = { name: string; label?: string; type?: string };
export type FilledField = {
  name: string;
  label: string;
  value: string | null;
  confidence: number;
  source: { docId: string; title: string } | null;
  reason: string;
};

const SYNONYMS: Record<string, string[]> = {
  full_name: ["name", "full name", "your name", "applicant", "legal name", "first and last name", "printed name"],
  email: ["email", "e-mail", "email address", "contact email"],
  phone: ["phone", "telephone", "mobile", "cell", "contact number", "phone number"],
  address: ["address", "street address", "home address", "mailing address", "residence"],
  employer: ["employer", "company", "organization", "business name", "current employer", "workplace"],
  policy_number: ["policy number", "policy no", "policy #", "insurance number"],
  account_number: ["account number", "account no", "acct", "account #"],
  vin: ["vin", "vehicle identification number", "chassis number"],
};

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Words that decide *which* field this is; a shared generic word is not enough. */
const HEAD_WORDS = new Set(["email", "phone", "address", "name", "employer", "company", "policy", "account", "vin", "mobile", "telephone"]);

/** Token-overlap similarity, biased toward exact and containment matches. */
function similarity(a: string, b: string): number {
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;

  const at = A.split(" "), bt = B.split(" ");
  const aHeads = at.filter((t) => HEAD_WORDS.has(t));
  const bHeads = bt.filter((t) => HEAD_WORDS.has(t));

  // "email address" vs "home address" share the word "address" but are different
  // fields. Require the *set* of head words to agree, so a generic word in common
  // can never carry a match on its own.
  if (aHeads.length && bHeads.length) {
    const aKey = [...new Set(aHeads)].sort().join("|");
    const bKey = [...new Set(bHeads)].sort().join("|");
    if (aKey !== bKey) return 0;
  }

  if (A.includes(B) || B.includes(A)) return 0.85;
  const as = new Set(at), bs = new Set(bt);
  const inter = [...as].filter((t) => bs.has(t)).length;
  return inter ? inter / Math.max(as.size, bs.size) : 0;
}

export function autofill(fields: FormField[]): { filled: FilledField[]; coverage: number } {
  const d = db();
  const profile = d.prepare("SELECT key, value, source_doc, confidence FROM form_profile").all() as any[];
  const docTitles = new Map(
    (d.prepare("SELECT id, title FROM documents").all() as any[]).map((x) => [x.id, x.title])
  );

  const filled: FilledField[] = fields.map((f) => {
    const label = f.label || f.name;
    let best: { p: any; score: number } | null = null;

    for (const p of profile) {
      const candidates = [p.key.replace(/_/g, " "), ...(SYNONYMS[p.key] ?? [])];
      const score = Math.max(...candidates.map((c) => Math.max(similarity(label, c), similarity(f.name, c))));
      if (score > 0.5 && (!best || score > best.score)) best = { p, score };
    }

    if (!best) {
      return {
        name: f.name,
        label,
        value: null,
        confidence: 0,
        source: null,
        reason: "No matching fact in your vault profile yet — upload a document containing it.",
      };
    }

    const confidence = Number((best.score * best.p.confidence).toFixed(2));
    return {
      name: f.name,
      label,
      value: best.p.value,
      confidence,
      source: best.p.source_doc ? { docId: best.p.source_doc, title: docTitles.get(best.p.source_doc) ?? "Unknown" } : null,
      reason: `Matched profile field "${best.p.key}" (label similarity ${(best.score * 100).toFixed(0)}%).`,
    };
  });

  const coverage = filled.length ? filled.filter((f) => f.value).length / filled.length : 0;
  return { filled, coverage };
}

/** Detect fillable fields from pasted form text (labels ending in : or ___ ). */
export function detectFields(formText: string): FormField[] {
  const fields: FormField[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const clean = label.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 60) return;
    const key = norm(clean).replace(/ /g, "_");
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ name: key, label: clean });
  };
  for (const m of formText.matchAll(/^\s*([A-Za-z][A-Za-z0-9 /'()#.-]{1,50}?)\s*[:：]\s*(?:_{2,}|\.{3,})?\s*$/gm)) push(m[1]);
  for (const m of formText.matchAll(/([A-Za-z][A-Za-z0-9 /'()#.-]{1,50}?)\s*[:：]\s*_{2,}/g)) push(m[1]);
  for (const m of formText.matchAll(/([A-Za-z][A-Za-z0-9 /'()#.-]{1,50}?)\s+_{3,}/g)) push(m[1]);
  return fields;
}

export function profileSnapshot() {
  const d = db();
  const rows = d.prepare("SELECT key, value, source_doc, confidence, updated_at FROM form_profile ORDER BY key").all() as any[];
  const titles = new Map((d.prepare("SELECT id, title FROM documents").all() as any[]).map((x) => [x.id, x.title]));
  return rows.map((r) => ({
    key: r.key,
    label: r.key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    value: r.value,
    confidence: r.confidence,
    sourceTitle: r.source_doc ? titles.get(r.source_doc) ?? null : null,
    sourceDoc: r.source_doc,
    updatedAt: r.updated_at,
  }));
}
