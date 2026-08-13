/**
 * End-to-end verification of the vault's behaviour and security properties.
 *   npx tsx scripts/test.ts
 *
 * Runs against a throwaway vault in data-test/ so your real vault is untouched.
 */
import fs from "node:fs";
import path from "node:path";

process.env.VAULT_DATA_DIR = path.join(process.cwd(), "data-test");
const TEST_DIR = process.env.VAULT_DATA_DIR;

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(t: string) {
  console.log(`\n${t}`);
}

async function main() {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_DIR, "blobs"), { recursive: true });

  const V = await import("../lib/vault");
  const { db, verifyAuditChain } = await import("../lib/db");
  const { search, askVault, parseQuery } = await import("../lib/search");
  const { convert } = await import("../lib/convert");
  const { autofill, detectFields } = await import("../lib/autofill");
  const L = await import("../lib/ai/local");
  const { SAMPLE_DOCS } = await import("./seed-docs");
  const { resolveDates } = await import("./dates");

  section("Vault lifecycle");
  V.initVault("test-passphrase");
  check("vault initialises", V.isUnlocked());
  V.lock();
  check("lock clears the session key", !V.isUnlocked());
  check("wrong passphrase is rejected", V.unlock("nope") === false);
  check("correct passphrase unlocks", V.unlock("test-passphrase") === true);

  section("Access control");
  V.lock();
  let denied = false;
  try {
    V.readBlob("anything");
  } catch (e: any) {
    denied = e.message === "VAULT_LOCKED";
  }
  check("reads are denied while locked", denied);
  V.unlock("test-passphrase");

  section("Ingestion pipeline");
  const ids: string[] = [];
  for (const d of SAMPLE_DOCS) {
    const r = await V.ingest({ name: d.filename, mime: d.mime, buffer: Buffer.from(resolveDates(d.text), "utf8") });
    ids.push(r.docId);
  }
  check("all sample documents ingest", ids.length === SAMPLE_DOCS.length, `${ids.length} documents`);

  const rows = db().prepare("SELECT category, subcategory, sensitivity, expires_at, amount, confidence FROM documents").all() as any[];
  check("every document is classified", rows.every((r) => r.category !== "Unsorted"));
  check("confidence is calibrated, not saturated",
    new Set(rows.map((r) => Math.round(r.confidence * 20))).size > 3,
    `${Math.min(...rows.map((r) => r.confidence)).toFixed(2)}–${Math.max(...rows.map((r) => r.confidence)).toFixed(2)}`);
  check("sensitivity tiers are assigned", rows.every((r) => r.sensitivity));
  check("restricted tier is used for PII-heavy docs", rows.some((r) => r.sensitivity === "restricted"));

  const dupe = await V.ingest({ name: SAMPLE_DOCS[0].filename, mime: "text/plain", buffer: Buffer.from(resolveDates(SAMPLE_DOCS[0].text), "utf8") });
  check("duplicate content is detected, not re-stored", dupe.duplicate === true);

  section("Encryption at rest");
  const doc = db().prepare("SELECT * FROM documents LIMIT 1").get() as any;
  const onDisk = fs.readFileSync(path.join(TEST_DIR, doc.blob_path));
  check("stored blob is not plaintext", !onDisk.toString("utf8").includes("INSURANCE") && !onDisk.toString("utf8").includes("Okafor"));
  const { buffer } = V.readBlob(doc.id);
  check("decryption round-trips exactly", require("crypto").createHash("sha256").update(buffer).digest("hex") === doc.sha256);

  const orig = Buffer.from(onDisk);
  const tampered = Buffer.from(onDisk);
  tampered[10] ^= 0xff;
  fs.writeFileSync(path.join(TEST_DIR, doc.blob_path), tampered);
  let caught = false;
  try {
    V.readBlob(doc.id);
  } catch {
    caught = true;
  }
  check("tampered ciphertext is rejected by GCM auth tag", caught);
  fs.writeFileSync(path.join(TEST_DIR, doc.blob_path), orig);

  section("Key rotation");
  const rot = V.rotatePassphrase("test-passphrase", "rotated-passphrase");
  check("rotation re-wraps every document key", rot.ok && rot.rewrapped === ids.length, `${rot.ok ? rot.rewrapped : 0} keys`);
  check("documents still decrypt after rotation", V.readBlob(doc.id).buffer.length > 0);
  check("old passphrase no longer works", (V.lock(), V.unlock("test-passphrase")) === false);
  check("new passphrase works", V.unlock("rotated-passphrase") === true);

  section("Search");
  const cases: [string, string][] = [
    ["car insurance deductible", "insurance"],
    ["monthly rent", "lease"],
    ["cholesterol results", "clinic"],
    ["electricity usage kwh", "hydro"],
    ["employment offer salary", "employment"],
  ];
  for (const [q, expect] of cases) {
    const r = search(q, 3);
    check(`"${q}" finds the right document`, r.hits.length > 0 && r.hits[0].title.toLowerCase().includes(expect), r.hits[0]?.title);
  }
  const pq = parseQuery("insurance from last year over $500 expiring in 3 months");
  check("natural-language filters are parsed",
    pq.category === "Insurance" && pq.minAmount === 500 && !!pq.after && pq.expiringDays === 90);

  section("Grounded question answering");
  const qa: [string, RegExp][] = [
    ["How much is my auto insurance premium?", /1,842/],
    ["When does my passport expire?", /\d{4}/],
    ["What is my monthly rent?", /2,350/],
    ["What is my base salary?", /128,000/],
    ["What interest rate does my account earn?", /1\.85/],
  ];
  for (const [q, re] of qa) {
    const a = await askVault(q);
    check(`answers: "${q}"`, re.test(a.answer), a.answer.slice(0, 70));
  }
  const none = await askVault("what is the airspeed velocity of an unladen swallow");
  check("declines when the vault has no answer", !/\$[\d,]+\.\d{2}/.test(none.answer));

  section("Deadline detection");
  const reminders = db().prepare("SELECT * FROM reminders").all() as any[];
  check("expiry dates create reminders", reminders.length >= 5, `${reminders.length} scheduled`);
  check("all reminder dates are in the future", reminders.every((r) => new Date(r.due_date) > new Date()));
  check("lead times vary by document type", new Set(reminders.map((r) => r.lead_days)).size > 1);

  section("Amount extraction");
  const amounts = db().prepare("SELECT title, amount FROM documents WHERE amount IS NOT NULL").all() as any[];
  const policy = amounts.find((a) => a.title.includes("meridian"));
  check("picks the premium, not the liability limit", policy?.amount === 1842, `$${policy?.amount}`);
  const offer = amounts.find((a) => a.title.includes("ardent"));
  check("picks the salary, not the signing bonus", offer?.amount === 128000, `$${offer?.amount}`);

  section("Secure sharing");
  const { id: sid, token } = V.createShare({ docId: doc.id, expiresInHours: 24, maxViews: 2, password: "s3cret", redact: true });
  check("password is required", V.resolveShare(token).ok === false);
  check("wrong password is rejected", V.resolveShare(token, "wrong").ok === false);
  check("correct password grants access", V.resolveShare(token, "s3cret").ok === true);
  check("unknown token is rejected", V.resolveShare("not-a-real-token").ok === false);
  V.revokeShare(sid);
  check("revocation takes effect immediately", V.resolveShare(token, "s3cret").ok === false);

  const expired = V.createShare({ docId: doc.id, expiresInHours: -1, maxViews: 5, redact: false });
  check("expired links are refused", (V.resolveShare(expired.token) as any).reason === "expired");

  const capped = V.createShare({ docId: doc.id, expiresInHours: 24, maxViews: 1, redact: false });
  V.recordShareView(capped.id, doc.id);
  check("view cap is enforced", (V.resolveShare(capped.token) as any).reason === "exhausted");

  const red = V.redactText("SSN 123-45-6789 card 4111 1111 1111 1111 email dan@x.com phone (416) 555-0142");
  check("redaction masks identifiers", !red.includes("123-45-6789") && !red.includes("4111 1111") && !red.includes("dan@x.com"), red.slice(0, 60));

  section("Format conversion");
  for (const t of ["txt", "md", "json", "csv", "pdf"] as const) {
    const r = await convert(doc.id, t);
    const valid = t === "pdf" ? r.body.subarray(0, 4).toString() === "%PDF" : r.body.length > 20;
    check(`converts to ${t}`, valid, `${r.body.length} bytes`);
  }
  const asJson = JSON.parse((await convert(doc.id, "json")).body.toString());
  check("JSON export carries AI metadata", !!asJson.category && Array.isArray(asJson.entities) && asJson.entities.length > 0);

  section("Form autofill");
  const fields = detectFields("Full Name: ____\nEmail Address: ____\nHome Address: ____\nEmployer: ____\nFavourite Colour: ____");
  check("detects fields in pasted forms", fields.length === 5, `${fields.length} fields`);
  const af = autofill(fields);
  const byLabel = Object.fromEntries(af.filled.map((f) => [f.label, f.value]));
  check("fills the name", byLabel["Full Name"] === "Daniel Okafor");
  check("does not confuse email with postal address",
    byLabel["Email Address"] !== byLabel["Home Address"],
    `email=${byLabel["Email Address"]} address=${byLabel["Home Address"]}`);
  check("leaves unknown fields blank rather than guessing", byLabel["Favourite Colour"] === null);
  check("every filled value cites a source document", af.filled.filter((f) => f.value).every((f) => f.source));

  section("Audit trail");
  const chain = verifyAuditChain();
  check("hash chain verifies", chain.ok, `${chain.entries} entries`);
  db().prepare("UPDATE audit_log SET action='tampered' WHERE id=(SELECT MIN(id) FROM audit_log)").run();
  check("chain detects an altered entry", verifyAuditChain().ok === false);

  section("Integrity & backup");
  const integ = V.verifyIntegrity();
  check("every document passes integrity verification", integ.failed === 0, `${integ.checked} checked`);
  const bk = V.runBackup("test-destination");
  check("backup records a manifest", bk.docCount === ids.length);

  section("Local NLP components");
  check("stemmer unifies expire/expiry", L.stem("expire") === L.stem("expiry"));
  const legal = SAMPLE_DOCS.find((d) => d.filename.includes("consulting-agreement"))!;
  const plain = "The cat sat on the mat. It was a warm day. She went to the shop. He read a book.";
  const legalGrade = L.readability(legal.text).grade;
  check("legal prose grades harder than plain prose",
    legalGrade > L.readability(plain).grade + 4,
    `legal ${legalGrade} vs plain ${L.readability(plain).grade}`);
  check("jargon glossary fires on legalese", L.readability(legal.text).jargon.length >= 3,
    L.readability(legal.text).jargon.map((j) => j.term).join(", "));
  check("embeddings are unit length", Math.abs(L.embed("test document").reduce((a, x) => a + x * x, 0) - 1) < 0.01);
  check("related text scores above unrelated",
    L.cosine(L.embed("car insurance premium policy"), L.embed("auto insurance annual premium")) >
      L.cosine(L.embed("car insurance premium policy"), L.embed("banana bread recipe")));

  console.log(`\n${"─".repeat(52)}`);
  console.log(`${pass} passed, ${fail} failed`);
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
