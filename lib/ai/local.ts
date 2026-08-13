/**
 * VaultMind Local NLP engine.
 *
 * A dependency-free, deterministic document-understanding stack:
 *   - lexicon-scored classification with confidence + runner-up reporting
 *   - regex/heuristic entity extraction (money, dates, ids, parties, policy #s)
 *   - TextRank-style extractive summarisation
 *   - readability scoring + jargon glossary for "explain like I'm five"
 *   - hashed bag-of-words embeddings for semantic retrieval (no model download)
 *
 * Everything runs in-process, so documents never leave the machine.
 */

// ─────────────────────────────── tokenisation ───────────────────────────────

const STOP = new Set(
  `a an the and or but if then else for of to in on at by with from as is are was were be been being this that these those it its it's you your we our they their he she his her i me my not no nor so than too very can will just don should now which who whom what when where why how all any both each few more most other some such only own same s t d ll m o re ve y ain aren couldn didn doesn hadn hasn haven isn ma mightn mustn needn shan shouldn wasn weren won wouldn shall may might must upon per via`.split(
    /\s+/
  )
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'&-]{1,}/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
}


/** Very small suffix stripper — enough to match expire/expiry/expires, pay/payment. */
export function stem(w: string): string {
  let s = w.toLowerCase();
  for (const suf of ["ations", "ation", "ements", "ement", "ingly", "edly", "ies", "ied", "ing", "ers", "er", "est", "ed", "es", "ly", "s"]) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  // expire/expiry/expiration -> expir ; renewal/renew -> renew
  s = s.replace(/(y|al|ment|ance|ence)$/, "");
  // drop a trailing silent 'e' so expire and expiry converge
  if (s.length > 4) s = s.replace(/e$/, "");
  return s.length >= 3 ? s : w.toLowerCase();
}

export function sentences(text: string): string[] {
  // Documents are frequently line-oriented (forms, declarations, statements) rather
  // than prose, so treat hard line breaks as boundaries too before sentence splitting.
  return text
    .split(/\r?\n+/)
    .flatMap((line) =>
      line
        .replace(/[ \t]+/g, " ")
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 600);
}

// ────────────────────────────── classification ──────────────────────────────

export type Category =
  | "Financial"
  | "Legal"
  | "Identity"
  | "Insurance"
  | "Medical"
  | "Property"
  | "Employment"
  | "Education"
  | "Tax"
  | "Vehicle"
  | "Utilities"
  | "Receipts"
  | "Unsorted";

const LEXICON: Record<Exclude<Category, "Unsorted">, { terms: Record<string, number>; sub: Record<string, string[]> }> = {
  Financial: {
    terms: { statement: 3, account: 2, balance: 3, deposit: 2, withdrawal: 2, interest: 2, transaction: 2, bank: 3, iban: 3, routing: 3, portfolio: 3, dividend: 3, brokerage: 3, invoice: 2, mortgage: 2, loan: 2, credit: 2, apr: 2 },
    sub: { "Bank Statement": ["statement", "balance", "deposit", "withdrawal"], Invoice: ["invoice", "due", "bill", "payable"], Investment: ["portfolio", "dividend", "brokerage", "shares"], Loan: ["loan", "principal", "amortization", "apr"] },
  },
  Legal: {
    terms: { agreement: 3, contract: 3, party: 2, hereby: 3, whereas: 3, indemnify: 3, jurisdiction: 3, clause: 2, covenant: 3, termination: 2, liability: 2, warranty: 2, arbitration: 3, "non-disclosure": 3, confidentiality: 2, witness: 2, notary: 3, deed: 3 },
    sub: { NDA: ["confidentiality", "non-disclosure", "disclose"], Lease: ["lease", "tenant", "landlord", "premises"], "Service Agreement": ["services", "provider", "deliverables", "sow"], Will: ["testament", "executor", "beneficiary", "estate"] },
  },
  Identity: {
    terms: { passport: 4, licence: 3, license: 3, identification: 3, citizen: 3, nationality: 3, birth: 2, issued: 2, expiry: 2, holder: 2, visa: 3, permit: 3, "social security": 4, ssn: 4, sin: 3 },
    sub: { Passport: ["passport", "nationality"], "Driver Licence": ["driver", "licence", "license", "class"], Visa: ["visa", "entries", "permit"], "Birth Certificate": ["birth", "certificate", "registrar"] },
  },
  Insurance: {
    terms: { policy: 4, premium: 4, coverage: 4, insured: 4, deductible: 4, claim: 3, underwriter: 3, beneficiary: 2, endorsement: 3, liability: 2, renewal: 2 },
    sub: { Auto: ["vehicle", "collision", "auto", "driver"], Health: ["health", "medical", "dental"], Home: ["dwelling", "property", "home", "contents"], Life: ["life", "beneficiary", "death benefit"] },
  },
  Medical: {
    terms: { patient: 4, diagnosis: 4, prescription: 4, dosage: 3, physician: 3, clinic: 3, lab: 2, results: 2, treatment: 3, symptoms: 3, mg: 2, referral: 3, immunization: 3, allergy: 2 },
    sub: { "Lab Result": ["lab", "specimen", "reference range"], Prescription: ["prescription", "dosage", "refill"], "Visit Summary": ["visit", "assessment", "plan"] },
  },
  Property: {
    terms: { property: 3, deed: 3, title: 2, mortgage: 3, tenant: 3, landlord: 3, lease: 3, premises: 3, "square feet": 2, appraisal: 3, escrow: 3, parcel: 3, zoning: 3 },
    sub: { Lease: ["tenant", "landlord", "rent"], Deed: ["deed", "grantor", "grantee"], Mortgage: ["mortgage", "lender", "amortization"] },
  },
  Employment: {
    terms: { employee: 4, employer: 4, salary: 4, compensation: 3, payroll: 4, offer: 2, position: 2, benefits: 2, vesting: 3, termination: 2, "start date": 3, wages: 3, bonus: 2, "job title": 3 },
    sub: { "Offer Letter": ["offer", "position", "start date"], Payslip: ["payroll", "gross", "net", "deductions"], Contract: ["employment", "term", "notice"] },
  },
  Education: {
    terms: { transcript: 4, degree: 3, gpa: 4, semester: 3, course: 3, credits: 3, university: 3, diploma: 4, enrollment: 3, student: 3, grade: 2, faculty: 2 },
    sub: { Transcript: ["transcript", "gpa", "credits"], Diploma: ["diploma", "conferred", "degree"], Enrollment: ["enrollment", "semester", "registration"] },
  },
  Tax: {
    terms: { tax: 4, irs: 4, deduction: 3, taxable: 4, "w-2": 4, "1099": 4, filing: 3, refund: 3, withholding: 4, "gross income": 3, cra: 4, "t4": 4, assessment: 2, exemption: 3 },
    sub: { Return: ["return", "filing", "refund"], Slip: ["w-2", "1099", "t4", "withholding"], Notice: ["notice", "assessment", "balance owing"] },
  },
  Vehicle: {
    terms: { vehicle: 4, vin: 4, odometer: 4, registration: 3, make: 2, model: 2, plate: 3, mileage: 3, chassis: 3, inspection: 2 },
    sub: { Registration: ["registration", "plate", "expiry"], "Purchase Agreement": ["purchase", "dealer", "trade-in"], Service: ["service", "odometer", "maintenance"] },
  },
  Utilities: {
    terms: { utility: 3, electricity: 4, kwh: 4, water: 3, gas: 3, meter: 4, usage: 3, billing: 3, "service address": 3, internet: 3, broadband: 3 },
    sub: { Electricity: ["kwh", "electricity", "meter"], Water: ["water", "gallons", "sewer"], Telecom: ["internet", "mobile", "broadband", "data"] },
  },
  Receipts: {
    terms: { receipt: 4, purchase: 3, subtotal: 4, "sales tax": 3, cashier: 3, refund: 2, merchant: 3, "order number": 3, qty: 3, warranty: 2 },
    sub: { Purchase: ["purchase", "subtotal", "cashier"], Warranty: ["warranty", "coverage", "years"], Expense: ["expense", "reimbursement", "claim"] },
  },
};

export type Classification = {
  category: Category;
  subcategory: string | null;
  confidence: number;
  runnerUp: { category: string; score: number } | null;
  signals: string[];
};

export function classify(text: string, filename = ""): Classification {
  const hay = (text + " " + filename.replace(/[-_.]/g, " ")).toLowerCase();
  const scores: { cat: Category; score: number; hits: string[] }[] = [];

  for (const [cat, def] of Object.entries(LEXICON)) {
    let score = 0;
    const hits: string[] = [];
    for (const [term, weight] of Object.entries(def.terms)) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      const n = (hay.match(re) || []).length;
      if (n > 0) {
        score += weight * Math.min(Math.sqrt(n), 3);
        hits.push(term);
      }
    }
    scores.push({ cat: cat as Category, score, hits });
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];
  if (!top || top.score < 4) {
    return { category: "Unsorted", subcategory: null, confidence: 0.25, runnerUp: null, signals: [] };
  }

  // confidence = how dominant the winner is over the runner-up, damped by absolute evidence
  const margin = second && second.score > 0 ? (top.score - second.score) / top.score : 1;
  const evidence = Math.min(top.score / 40, 1);
  // Keep the scale honest: saturating at ~0.98 for every document would make the
  // number meaningless, so evidence and margin each contribute a bounded share.
  const confidence = Math.max(0.35, Math.min(0.97, 0.34 + 0.4 * evidence + 0.23 * margin * evidence));

  // subcategory
  let subcategory: string | null = null;
  let best = 0;
  for (const [name, kws] of Object.entries(LEXICON[top.cat as Exclude<Category, "Unsorted">].sub)) {
    const s = kws.reduce((acc, k) => acc + (hay.includes(k) ? 1 : 0), 0);
    if (s > best) {
      best = s;
      subcategory = name;
    }
  }

  return {
    category: top.cat,
    subcategory: best > 0 ? subcategory : null,
    confidence: Number(confidence.toFixed(3)),
    runnerUp: second && second.score > 0 ? { category: second.cat, score: Number(second.score.toFixed(1)) } : null,
    signals: top.hits.slice(0, 8),
  };
}

/**
 * Pick the amount a human would call "the" figure on this document.
 * The largest number is usually wrong — an insurance policy's $2,000,000 liability
 * limit is not what the policy costs. Cue words next to the figure decide instead.
 */
export function primaryAmount(text: string): { value: number; raw: string; cue: string } | null {
  const STRONG = /(total\s+(?:amount\s+)?due|amount\s+due|total\s+due|grand\s+total|balance\s+due|total\s+payable|annual\s+premium|premium|rent\s+of|salary\s+will\s+be|base\s+salary|refund\s+issued|closing\s+balance|total)/i;
  const WEAK = /(subtotal|deposit|deductible|fee|charge|payment|rate|price|cost|amount)/i;
  const EXCLUDE = /(up\s+to|limit\s+of|coverage|liability|maximum|not\s+exceed|per\s+occurrence)/i;

  const money = /(?:USD|CAD|EUR|GBP|\$|€|£)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/g;
  const cands: { value: number; raw: string; cue: string; score: number }[] = [];

  for (const m of text.matchAll(money)) {
    const value = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(value) || value <= 0) continue;
    const idx = m.index ?? 0;
    // inspect the words immediately before the figure, on the same line
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    const before = text.slice(Math.max(lineStart, idx - 90), idx);

    let score = 1;
    let cue = "";
    if (EXCLUDE.test(before)) score = 0.05;
    else if (STRONG.test(before)) { score = 10; cue = before.match(STRONG)![0].trim(); }
    else if (WEAK.test(before)) { score = 3; cue = before.match(WEAK)![0].trim(); }

    // an ALL-CAPS label ("TOTAL AMOUNT DUE") is a strong layout signal
    if (/[A-Z]{4,}[^a-z]*$/.test(before.trim())) score *= 1.6;
    cands.push({ value, raw: m[0], cue, score });
  }
  if (!cands.length) return null;

  cands.sort((a, b) => b.score - a.score || b.value - a.value);
  const top = cands[0];
  return { value: top.value, raw: top.raw, cue: top.cue || "largest salient figure" };
}

// ─────────────────────────────── entities ───────────────────────────────

export type Entity = { kind: string; value: string; normalized?: string; confidence: number };

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

export function extractEntities(text: string): Entity[] {
  const out: Entity[] = [];
  const push = (kind: string, value: string, confidence = 0.85, normalized?: string) => {
    const v = value.trim();
    if (!v) return;
    if (out.some((e) => e.kind === kind && e.value.toLowerCase() === v.toLowerCase())) return;
    out.push({ kind, value: v, normalized, confidence });
  };

  // money
  for (const m of text.matchAll(/(?:USD|CAD|EUR|GBP|\$|€|£)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/g)) {
    const raw = m[0];
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (!isNaN(num) && num > 0) push("money", raw, 0.9, String(num));
  }

  // dates - several shapes
  for (const m of text.matchAll(new RegExp(`\\b(${MONTHS})\\s+([0-9]{1,2}),?\\s+((?:19|20)[0-9]{2})\\b`, "gi"))) {
    push("date", m[0], 0.92, normalizeDate(m[0]));
  }
  for (const m of text.matchAll(/\b((?:19|20)[0-9]{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12][0-9]|3[01])\b/g)) {
    push("date", m[0], 0.92, normalizeDate(m[0]));
  }
  for (const m of text.matchAll(/\b(0?[1-9]|1[0-2])[/](0?[1-9]|[12][0-9]|3[01])[/]((?:19|20)[0-9]{2})\b/g)) {
    push("date", m[0], 0.85, normalizeDate(m[0]));
  }

  // contact
  for (const m of text.matchAll(/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g)) push("email", m[0], 0.97);
  for (const m of text.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)) push("phone", m[0], 0.8);

  // identifiers
  // identifiers must contain at least one digit, otherwise we pick up stray words
  const idLike = (s: string) => /\d/.test(s) && !/^(number|no|declaration|statement|document)$/i.test(s);
  for (const m of text.matchAll(/\bpolicy\s*(?:no\.?|number|#)?\s*[:#]\s*([A-Z0-9][A-Z0-9-]{4,})/gi)) {
    if (idLike(m[1])) push("policy_number", m[1], 0.9);
  }
  for (const m of text.matchAll(/\b(?:account|acct)\s*(?:no\.?|number|#)?\s*[:#]\s*([X*\d][X*\d-]{5,})/gi)) {
    if (idLike(m[1])) push("account_number", m[1], 0.88);
  }
  for (const m of text.matchAll(/\b(?:invoice|inv)\s*(?:no\.?|number|#)?\s*[:#]\s*([A-Z0-9][A-Z0-9-]{3,})/gi)) {
    if (idLike(m[1])) push("invoice_number", m[1], 0.88);
  }
  for (const m of text.matchAll(/\bVIN\s*[:#]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi)) push("vin", m[1], 0.95);
  for (const m of text.matchAll(/\b[A-Z]{1,2}\d{6,9}\b/g)) push("document_number", m[0], 0.6);

  // people / orgs (capitalised runs after cue words, plus Inc/LLC style orgs)
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}(?:\s+(?:Inc|LLC|Ltd|Corp|Corporation|Company|Bank|Group|Holdings|Insurance|University|Hospital|Clinic))\.?)\b/g)) {
    push("organization", m[1], 0.82);
  }
  for (const m of text.matchAll(/\b(?:Name|Insured|Employee|Patient|Holder|Client|Tenant|Borrower|Issued to|Bill to|Prepared for)\s*[:\-][ \t]*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,3})/g)) {
    push("person", m[1], 0.88);
  }

  // addresses
  for (const m of text.matchAll(/\b\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b\.?/g)) {
    push("address", m[0], 0.78);
  }

  // percentages / rates
  for (const m of text.matchAll(/\b\d{1,2}(?:\.\d{1,3})?\s?%/g)) push("percentage", m[0], 0.8);

  return out;
}

export function normalizeDate(s: string): string | undefined {
  const d = new Date(s.replace(/(\d)(st|nd|rd|th)/gi, "$1"));
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

/** Find the date that behaves like an expiry, using nearby cue words. */
export function findExpiry(text: string): { date: string; cue: string } | null {
  const cues =
    /(expir\w*|valid\s+(?:un)?til|renew\s+(?:no\s+later\s+than|by|before)|renewal\s+date|due\s+(?:date|by|on)|terminat(?:ing|es?|ion)\s+(?:on|date)|end\s+date|ends?\s+on|next\s+payment|maturity|good\s+through|coverage\s+ends?|deadline\s+(?:to|for|is)?|payable\s+(?:by|on)|continues?\s+until)/gi;
  const candidates: { date: string; cue: string; dist: number }[] = [];
  for (const cm of text.matchAll(cues)) {
    const idx = cm.index ?? 0;
    const window = text.slice(idx, idx + 160);
    const ents = extractEntities(window).filter((e) => e.kind === "date" && e.normalized);
    for (const e of ents) {
      candidates.push({ date: e.normalized!, cue: cm[0], dist: window.indexOf(e.value) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  // prefer future dates when several cues match
  const future = candidates.filter((c) => new Date(c.date).getTime() > Date.now());
  const pick = future[0] ?? candidates[0];
  return { date: pick.date, cue: pick.cue.toLowerCase() };
}

// ────────────────────────── extractive summarisation ──────────────────────────

/** TextRank-lite: score sentences by lexical overlap with the whole document. */
export function summarize(text: string, maxSentences = 3): string {
  const sents = sentences(text);
  if (!sents.length) return text.slice(0, 220).trim();
  if (sents.length <= maxSentences) return sents.join(" ");

  const df = new Map<string, number>();
  const docTokens = sents.map((s) => {
    const t = new Set(tokens(s));
    for (const w of t) df.set(w, (df.get(w) || 0) + 1);
    return t;
  });
  const N = sents.length;

  const scored = sents.map((s, i) => {
    const t = docTokens[i];
    let score = 0;
    for (const w of t) {
      const idf = Math.log(1 + N / (df.get(w) || 1));
      score += idf;
    }
    score /= Math.sqrt(t.size || 1);
    // length prior: short label-like fragments ("Vehicle: RAV4") make poor summary
    // sentences, and very long ones bloat the result.
    const wc = t.size;
    score *= wc < 5 ? 0.45 + wc * 0.1 : wc > 45 ? 0.8 : 1;
    // positional prior: openings usually carry the thesis
    if (i === 0) score *= 1.35;
    else if (i < 3) score *= 1.15;
    // sentences with numbers/dates tend to be substantive in documents
    if (/\d/.test(s)) score *= 1.1;
    // prose beats bare "Key: value" lines
    if (!/^[A-Z][A-Za-z ]{2,24}:/.test(s)) score *= 1.15;
    return { s, score, i };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(" ");
}

// ───────────────────────── readability + plain language ─────────────────────────

const GLOSSARY: Record<string, string> = {
  indemnify: "cover someone else's losses",
  indemnification: "covering someone else's losses",
  hereinafter: "from here on",
  whereas: "given that",
  heretofore: "until now",
  notwithstanding: "despite",
  "force majeure": "unavoidable disaster clause",
  arbitration: "settling disputes privately instead of in court",
  "liquidated damages": "a pre-agreed penalty amount",
  covenant: "a binding promise",
  deductible: "what you pay before insurance kicks in",
  premium: "what you pay for the policy",
  underwriter: "the company assessing your risk",
  "pro rata": "split proportionally",
  amortization: "paying off a loan in scheduled pieces",
  escrow: "money held by a neutral third party",
  lien: "a legal claim on your property until a debt is paid",
  "in perpetuity": "forever",
  jurisdiction: "which courts and laws apply",
  "severability": "if one clause fails the rest still stands",
  remittance: "a payment sent",
  accrued: "built up over time",
  "net 30": "payable within 30 days",
  garnishment: "money taken directly from your pay",
  beneficiary: "the person who receives the benefit",
  vesting: "when something becomes fully yours",
  encumbrance: "a restriction or claim on property",
  "quid pro quo": "something given in exchange",
  "prima facie": "on first look",
  "ipso facto": "by that fact alone",
};

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

export type Readability = {
  grade: number;
  ease: number;
  level: "plain" | "moderate" | "complex" | "very complex";
  words: number;
  avgSentenceLength: number;
  jargon: { term: string; meaning: string }[];
};

export function readability(text: string): Readability {
  const sents = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = (text.match(/\b[\w'-]+\b/g) || []).length || 1;
  const syl = (text.match(/\b[\w'-]+\b/g) || []).reduce((a, w) => a + syllables(w), 0);
  const asl = words / sents;
  const asw = syl / words;
  const grade = Math.max(1, Math.round((0.39 * asl + 11.8 * asw - 15.59) * 10) / 10);
  const ease = Math.round((206.835 - 1.015 * asl - 84.6 * asw) * 10) / 10;

  const lower = text.toLowerCase();
  const jargon = Object.entries(GLOSSARY)
    .filter(([term]) => lower.includes(term))
    .slice(0, 8)
    .map(([term, meaning]) => ({ term, meaning }));

  const level: Readability["level"] = grade >= 16 ? "very complex" : grade >= 13 ? "complex" : grade >= 9 ? "moderate" : "plain";
  return { grade, ease, level, words, avgSentenceLength: Math.round(asl * 10) / 10, jargon };
}

/** Rewrite key points in short, plain sentences (deterministic fallback). */
export function plainLanguage(text: string, cls: Classification, ents: Entity[]): string {
  const money = ents.filter((e) => e.kind === "money").slice(0, 3).map((e) => e.value);
  const dates = ents.filter((e) => e.kind === "date").slice(0, 3).map((e) => e.value);
  const parties = ents.filter((e) => e.kind === "organization" || e.kind === "person").slice(0, 3).map((e) => e.value);
  const r = readability(text);

  const lines: string[] = [];
  const what: Record<string, string> = {
    Financial: "This is a money document from your bank or a company you pay.",
    Legal: "This is a legal agreement — it creates promises you are expected to keep.",
    Identity: "This is an official ID document that proves who you are.",
    Insurance: "This is an insurance policy: what you pay, and what it covers.",
    Medical: "This is a health record about your care or test results.",
    Property: "This document is about a home or piece of land.",
    Employment: "This is a work document about your job, pay, or terms.",
    Education: "This is a school record about your studies or qualifications.",
    Tax: "This is a tax document you may need when you file.",
    Vehicle: "This document is about a vehicle you own or drive.",
    Utilities: "This is a bill for a service like power, water, or internet.",
    Receipts: "This is proof that you bought something.",
    Unsorted: "This document didn't match a known category, so review it manually.",
  };
  lines.push(`**What it is:** ${what[cls.category]}`);
  if (parties.length) lines.push(`**Who's involved:** ${parties.join(", ")}.`);
  if (money.length) lines.push(`**Money mentioned:** ${money.join(", ")}. Check these figures against what you expected.`);
  if (dates.length) lines.push(`**Dates that matter:** ${dates.join(", ")}.`);
  lines.push(
    `**How hard it is to read:** grade ${r.grade} (${r.level}). ${
      r.level === "very complex" || r.level === "complex"
        ? "That's above typical everyday reading — take the plain-English points below rather than the raw wording."
        : "That's within normal everyday reading."
    }`
  );
  if (r.jargon.length) {
    lines.push(`**Jargon decoded:** ` + r.jargon.map((j) => `_${j.term}_ = ${j.meaning}`).join("; ") + ".");
  }
  const key = summarize(text, 2);
  if (key) lines.push(`**The gist:** ${key}`);
  return lines.join("\n\n");
}

// ─────────────────────────── embeddings + retrieval ───────────────────────────

const DIM = 256;

/** Hashed bag-of-words embedding with sublinear TF — cheap, local, and good enough for RAG. */
export function embed(text: string): number[] {
  const v = new Array(DIM).fill(0);
  const tf = new Map<string, number>();
  const toks = tokens(text);
  for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
  // include bigrams for a little word-order sensitivity
  for (let i = 0; i < toks.length - 1; i++) {
    const bg = toks[i] + "_" + toks[i + 1];
    tf.set(bg, (tf.get(bg) || 0) + 1);
  }
  for (const [term, count] of tf) {
    let h = 2166136261;
    for (let i = 0; i < term.length; i++) {
      h ^= term.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    v[idx] += sign * (1 + Math.log(count));
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => Number((x / norm).toFixed(5)));
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Split text into overlapping chunks on sentence boundaries. */
export function chunk(text: string, target = 700, overlap = 120): string[] {
  const sents = sentences(text);
  if (!sents.length) return text.trim() ? [text.trim().slice(0, target)] : [];
  const out: string[] = [];
  let cur = "";
  for (const s of sents) {
    if (cur.length + s.length > target && cur) {
      out.push(cur.trim());
      cur = cur.slice(Math.max(0, cur.length - overlap));
    }
    // join with newlines: chunks are re-split into sentences at query time, and
    // document lines often have no terminal punctuation to split on.
    cur += "\n" + s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Pull the sentences that actually answer a question (extractive QA). */
export function answerFrom(question: string, passages: { text: string; docId: string; title: string }[]) {
  const qTok = new Set(tokens(question).map(stem));
  const q = question.toLowerCase();

  // What *shape* of answer is being asked for? A sentence that contains the right
  // shape (a sum of money, a date, a percentage) is far more likely to be the answer.
  const wantsMoney = /\b(how much|cost|price|amount|premium|salary|rent|fee|pay|paid|balance|total|refund|deductible|owe)\b/.test(q);
  const wantsDate = /\b(when|what date|expire|expiry|due|deadline|renew|start|end|valid)\b/.test(q);
  const wantsPercent = /\b(rate|percent|interest|apr|%)\b/.test(q);
  const wantsWho = /\b(who|whom|which company|issuer|landlord|employer|insurer|provider)\b/.test(q);

  const moneyRe = /(?:USD|CAD|EUR|GBP|\$|€|£)\s?[\d,]+(?:\.\d{2})?/;
  const dateRe = new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2},?\\s+(?:19|20)\\d{2}\\b|\\b(?:19|20)\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}\\b`, "i");
  const percentRe = /\d{1,2}(?:\.\d+)?\s?%/;
  const properRe = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;

  const scored = passages.flatMap((p) =>
    sentences(p.text).map((s) => {
      const st = tokens(s).map(stem);
      const overlap = st.filter((t) => qTok.has(t)).length;
      const density = overlap / Math.sqrt(st.length || 1);
      let score = overlap * 1.6 + density * 3;

      // answer-shape bonus (and a penalty when the expected shape is absent)
      if (wantsMoney) score *= moneyRe.test(s) ? 2.2 : 0.55;
      if (wantsDate) score *= dateRe.test(s) ? 2.0 : 0.6;
      if (wantsPercent && percentRe.test(s)) score *= 1.8;
      if (wantsWho && properRe.test(s)) score *= 1.4;

      // header/boilerplate lines are rarely the answer
      if (/^[A-Z][A-Z \-—]{8,}$/.test(s.trim())) score *= 0.25;
      if (st.length < 3) score *= 0.6;
      // a focused line answers better than a long merged block
      if (s.length > 320) score *= 0.6;

      return { sentence: s.trim(), score, docId: p.docId, title: p.title };
    })
  );

  // de-duplicate identical sentences across overlapping chunks
  const seen = new Set<string>();
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const k = s.sentence.slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 5);
}
