/**
 * Seed the demo vault. Safe to re-run: it wipes data/ and rebuilds from scratch.
 *   npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import { SAMPLE_DOCS } from "./seed-docs";
import { resolveDates } from "./dates";

const DATA = path.join(process.cwd(), "data");
const PASSPHRASE = process.env.VAULT_DEMO_PASSPHRASE || "demo-passphrase";

async function main() {
  if (fs.existsSync(DATA)) fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(path.join(DATA, "blobs"), { recursive: true });

  const { initVault, ingest, runBackup } = await import("../lib/vault");
  const { db } = await import("../lib/db");

  initVault(PASSPHRASE);
  console.log(`vault initialised (passphrase: ${PASSPHRASE})`);

  const t0 = Date.now();
  for (const doc of SAMPLE_DOCS) {
    const text = resolveDates(doc.text);
    const r = await ingest({ name: doc.filename, mime: doc.mime, buffer: Buffer.from(text, "utf8") });
    const row = db().prepare("SELECT category, subcategory, sensitivity, expires_at, confidence FROM documents WHERE id=?").get(r.docId) as any;
    console.log(
      `  ✓ ${doc.filename.padEnd(42)} ${String(row.category).padEnd(11)} ${String(row.subcategory ?? "—").padEnd(16)} ` +
        `${row.sensitivity.padEnd(13)} conf=${Number(row.confidence).toFixed(2)} ${row.expires_at ? "expires " + row.expires_at : ""}`
    );
  }

  runBackup("local-encrypted-snapshot");

  const counts = db().prepare("SELECT (SELECT COUNT(*) FROM documents) d, (SELECT COUNT(*) FROM entities) e, (SELECT COUNT(*) FROM chunks) c, (SELECT COUNT(*) FROM reminders) r, (SELECT COUNT(*) FROM agent_runs) a").get() as any;
  console.log(`\nseeded in ${Date.now() - t0}ms → ${counts.d} docs, ${counts.e} entities, ${counts.c} chunks, ${counts.r} reminders, ${counts.a} agent runs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
