/**
 * Hybrid retrieval: FTS5/BM25 keyword matching fused with local embedding
 * similarity via Reciprocal Rank Fusion, plus a natural-language filter parser
 * ("insurance from last year over $500") and grounded extractive Q&A.
 */
import { db } from "./db";
import * as L from "./ai/local";
import { llmJson } from "./ai/engine";

export type SearchHit = {
  docId: string;
  title: string;
  category: string;
  subcategory: string | null;
  sensitivity: string;
  docDate: string | null;
  expiresAt: string | null;
  amount: number | null;
  snippet: string;
  score: number;
  matchedBy: ("keyword" | "semantic" | "entity")[];
};

export type ParsedQuery = {
  terms: string;
  category?: string;
  after?: string;
  before?: string;
  minAmount?: number;
  maxAmount?: number;
  expiringDays?: number;
  sensitivity?: string;
};

const CATEGORY_WORDS: Record<string, string> = {
  insurance: "Insurance", policy: "Insurance", tax: "Tax", taxes: "Tax", legal: "Legal", contract: "Legal",
  agreement: "Legal", medical: "Medical", health: "Medical", bank: "Financial", financial: "Financial",
  finance: "Financial", invoice: "Financial", identity: "Identity", passport: "Identity", licence: "Identity",
  license: "Identity", property: "Property", lease: "Property", employment: "Employment", job: "Employment",
  work: "Employment", education: "Education", school: "Education", vehicle: "Vehicle", car: "Vehicle",
  utility: "Utilities", utilities: "Utilities", bill: "Utilities", receipt: "Receipts", receipts: "Receipts",
};

/** Turn "insurance from last year over $500" into structured filters + residual terms. */
export function parseQuery(q: string): ParsedQuery {
  let terms = q;
  const out: ParsedQuery = { terms: q };
  const now = new Date();

  const strip = (re: RegExp) => {
    terms = terms.replace(re, " ");
  };

  // amounts
  const over = q.match(/\b(?:over|above|more than|greater than|>)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (over) {
    out.minAmount = parseFloat(over[1].replace(/,/g, ""));
    strip(new RegExp(over[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  const under = q.match(/\b(?:under|below|less than|<)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (under) {
    out.maxAmount = parseFloat(under[1].replace(/,/g, ""));
    strip(new RegExp(under[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  // time
  if (/\blast year\b/i.test(q)) {
    out.after = `${now.getFullYear() - 1}-01-01`;
    out.before = `${now.getFullYear() - 1}-12-31`;
    strip(/\blast year\b/i);
  }
  if (/\bthis year\b/i.test(q)) {
    out.after = `${now.getFullYear()}-01-01`;
    strip(/\bthis year\b/i);
  }
  const lastN = q.match(/\blast (\d+)\s*(day|week|month|year)s?\b/i);
  if (lastN) {
    const n = parseInt(lastN[1]);
    const mult = { day: 1, week: 7, month: 30, year: 365 }[lastN[2].toLowerCase() as "day"] ?? 1;
    out.after = new Date(now.getTime() - n * mult * 864e5).toISOString().slice(0, 10);
    strip(new RegExp(lastN[0], "i"));
  }
  const inYear = q.match(/\b(?:in|from|during)\s+((?:19|20)\d{2})\b/i);
  if (inYear) {
    out.after = `${inYear[1]}-01-01`;
    out.before = `${inYear[1]}-12-31`;
    strip(new RegExp(inYear[0], "i"));
  }

  // expiry intent
  const exp = q.match(/\bexpir\w*\s+(?:in\s+)?(?:the\s+)?(?:next\s+)?(\d+)?\s*(day|week|month)s?\b/i);
  if (exp) {
    const n = exp[1] ? parseInt(exp[1]) : 1;
    const mult = { day: 1, week: 7, month: 30 }[exp[2].toLowerCase() as "day"] ?? 1;
    out.expiringDays = n * mult;
    strip(new RegExp(exp[0], "i"));
  } else if (/\bexpiring|expires?\s+soon\b/i.test(q)) {
    out.expiringDays = 90;
    strip(/\bexpiring|expires?\s+soon\b/i);
  }

  // sensitivity
  const sens = q.match(/\b(restricted|confidential|internal|public)\b/i);
  if (sens) {
    out.sensitivity = sens[1].toLowerCase();
    strip(new RegExp(`\\b${sens[1]}\\b`, "i"));
  }

  // category
  for (const [word, cat] of Object.entries(CATEGORY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(terms)) {
      out.category = cat;
      break;
    }
  }

  out.terms = terms.replace(/\b(show|find|get|me|all|my|the|documents?|docs?|files?|about|with|for)\b/gi, " ").replace(/\s+/g, " ").trim();
  return out;
}

function ftsQuery(terms: string): string | null {
  const toks = L.tokens(terms);
  if (!toks.length) return null;
  // OR the terms so partial matches still rank; FTS5 handles the scoring.
  return toks.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
}

export function search(rawQuery: string, limit = 25): { hits: SearchHit[]; parsed: ParsedQuery; timingMs: number } {
  const t0 = performance.now();
  const parsed = parseQuery(rawQuery);
  const d = db();

  const keywordRanks = new Map<string, number>();
  const semanticRanks = new Map<string, number>();
  const snippets = new Map<string, string>();

  // ── keyword leg (BM25 via FTS5)
  const fq = ftsQuery(parsed.terms || rawQuery);
  if (fq) {
    try {
      const rows = d
        .prepare(
          `SELECT doc_id, bm25(doc_fts, 4.0, 1.0, 2.0, 3.0) AS rank,
                  snippet(doc_fts, 2, '<mark>', '</mark>', '…', 24) AS snip
             FROM doc_fts WHERE doc_fts MATCH ? ORDER BY rank LIMIT 60`
        )
        .all(fq) as any[];
      rows.forEach((r, i) => {
        keywordRanks.set(r.doc_id, i + 1);
        if (r.snip) snippets.set(r.doc_id, r.snip);
      });
    } catch {
      /* malformed FTS expression — fall back to semantic only */
    }
  }

  // ── semantic leg (cosine over chunk embeddings)
  if ((parsed.terms || rawQuery).trim()) {
    const qv = L.embed(parsed.terms || rawQuery);
    const chunks = d.prepare("SELECT doc_id, text, vector FROM chunks").all() as any[];
    const best = new Map<string, { score: number; text: string }>();
    for (const c of chunks) {
      const s = L.cosine(qv, JSON.parse(c.vector));
      const cur = best.get(c.doc_id);
      if (!cur || s > cur.score) best.set(c.doc_id, { score: s, text: c.text });
    }
    [...best.entries()]
      .filter(([, v]) => v.score > 0.04)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 60)
      .forEach(([docId, v], i) => {
        semanticRanks.set(docId, i + 1);
        if (!snippets.has(docId)) snippets.set(docId, v.text.slice(0, 220) + "…");
      });
  }

  // ── reciprocal rank fusion
  const K = 60;
  const fused = new Map<string, { score: number; by: Set<"keyword" | "semantic" | "entity"> }>();
  const bump = (id: string, rank: number, by: "keyword" | "semantic" | "entity", weight = 1) => {
    const cur = fused.get(id) ?? { score: 0, by: new Set<any>() };
    cur.score += weight / (K + rank);
    cur.by.add(by);
    fused.set(id, cur);
  };
  keywordRanks.forEach((r, id) => bump(id, r, "keyword", 1.0));
  semanticRanks.forEach((r, id) => bump(id, r, "semantic", 0.85));

  // exact entity matches are a strong signal (e.g. searching a policy number)
  if (parsed.terms.trim().length > 3) {
    const ents = d
      .prepare("SELECT DISTINCT doc_id FROM entities WHERE lower(value) LIKE ? LIMIT 20")
      .all(`%${parsed.terms.toLowerCase().trim()}%`) as any[];
    ents.forEach((e, i) => bump(e.doc_id, i + 1, "entity", 1.2));
  }

  // no query text at all → browse mode
  if (!fused.size) {
    const rows = d.prepare("SELECT id FROM documents WHERE status != 'deleted' ORDER BY created_at DESC LIMIT 60").all() as any[];
    rows.forEach((r, i) => bump(r.id, i + 1, "keyword", 0.5));
  }

  // ── hydrate + filter
  const ids = [...fused.keys()];
  if (!ids.length) return { hits: [], parsed, timingMs: performance.now() - t0 };

  const placeholders = ids.map(() => "?").join(",");
  const docs = d
    .prepare(`SELECT * FROM documents WHERE id IN (${placeholders}) AND status != 'deleted'`)
    .all(...ids) as any[];

  const horizon = parsed.expiringDays ? new Date(Date.now() + parsed.expiringDays * 864e5).toISOString().slice(0, 10) : null;
  const today = new Date().toISOString().slice(0, 10);

  const hits: SearchHit[] = docs
    .filter((doc) => {
      if (parsed.category && doc.category !== parsed.category) return false;
      if (parsed.sensitivity && doc.sensitivity !== parsed.sensitivity) return false;
      if (parsed.minAmount != null && !(doc.amount >= parsed.minAmount)) return false;
      if (parsed.maxAmount != null && !(doc.amount <= parsed.maxAmount)) return false;
      if (parsed.after && (!doc.doc_date || doc.doc_date < parsed.after)) return false;
      if (parsed.before && (!doc.doc_date || doc.doc_date > parsed.before)) return false;
      if (horizon && (!doc.expires_at || doc.expires_at > horizon || doc.expires_at < today)) return false;
      return true;
    })
    .map((doc) => {
      const f = fused.get(doc.id)!;
      return {
        docId: doc.id,
        title: doc.title,
        category: doc.category,
        subcategory: doc.subcategory,
        sensitivity: doc.sensitivity,
        docDate: doc.doc_date,
        expiresAt: doc.expires_at,
        amount: doc.amount,
        snippet: snippets.get(doc.id) || (doc.summary ?? "").slice(0, 200),
        score: Number(f.score.toFixed(5)),
        matchedBy: [...f.by],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { hits, parsed, timingMs: performance.now() - t0 };
}

/** Grounded Q&A: retrieve, then answer strictly from retrieved passages. */
export async function askVault(question: string) {
  const t0 = performance.now();
  const { hits } = search(question, 6);
  const d = db();

  const qv = L.embed(question);
  const passages = hits.slice(0, 5).map((h) => {
    const rows = d.prepare("SELECT text, vector FROM chunks WHERE doc_id = ?").all(h.docId) as any[];
    // Take the two best chunks: the answer often sits just outside the single
    // closest window (e.g. a declarations table vs. the prose around it).
    const best = rows
      .map((r) => ({ text: r.text as string, s: L.cosine(qv, JSON.parse(r.vector)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    return { docId: h.docId, title: h.title, text: best.map((b) => b.text).join("\n") || h.snippet };
  });

  if (!passages.length) {
    return {
      answer: "I couldn't find anything in your vault that answers that. Try different wording, or upload the document first.",
      citations: [],
      engine: "local",
      ms: performance.now() - t0,
    };
  }

  const llm = await llmJson<{ answer: string; used: string[] }>({
    system:
      "Answer ONLY from the provided document excerpts. Cite the document titles you used. " +
      "If the excerpts do not contain the answer, say so plainly. JSON: {answer, used:[title]}",
    user:
      `Question: ${question}\n\n` +
      passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text.slice(0, 1500)}`).join("\n\n"),
    maxTokens: 500,
  });

  if (llm?.answer) {
    return {
      answer: llm.answer,
      citations: passages.map((p) => ({ docId: p.docId, title: p.title })),
      engine: "openai",
      ms: performance.now() - t0,
    };
  }

  // local extractive answer
  const spans = L.answerFrom(question, passages);
  // Only keep supporting sentences that are competitive with the best one, so a
  // confident single-sentence answer isn't diluted by weak filler.
  const keep = spans.length ? spans.filter((s) => s.score >= spans[0].score * 0.55).slice(0, 2) : [];
  const answer = keep.length
    ? keep.map((s) => s.sentence).join(" ")
    : `The closest match is "${passages[0].title}", but I couldn't isolate a sentence that directly answers that. Open the document to check.`;

  const citeIds = new Set(keep.map((s) => s.docId));
  const citations = passages.filter((p) => citeIds.has(p.docId)).map((p) => ({ docId: p.docId, title: p.title }));

  return {
    answer,
    citations: citations.length ? citations : [{ docId: passages[0].docId, title: passages[0].title }],
    engine: "local",
    ms: performance.now() - t0,
  };
}
