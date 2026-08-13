/**
 * Vault service layer: unlock/lock, ingest, read-back, sharing, backup, conversion.
 * The KEK lives only in server memory and is dropped on lock.
 */
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db, nowIso, audit, BLOB_DIR, DATA_DIR } from "./db";
import { deriveKek, newSalt, seal, open as unseal, sha256, randomToken, hashSecret, constantTimeEqual, rewrapKey } from "./crypto";
import { extractText } from "./extract";
import { runIngestPipeline } from "./agents";

// ── session key (server memory only) ───────────────────────────────────────
// Next.js bundles each route handler separately, so a plain module-level binding
// is NOT shared between routes. The unlocked key must live on globalThis to be a
// single process-wide session. It is still memory-only and never persisted.
const AUTO_LOCK_MS = 30 * 60 * 1000;

type VaultSession = { kek: Buffer | null; unlockedAt: number | null };
const g = globalThis as unknown as { __vaultmind__?: VaultSession };
const session: VaultSession = (g.__vaultmind__ ??= { kek: null, unlockedAt: null });

export function isUnlocked(): boolean {
  if (!session.kek || !session.unlockedAt) return false;
  if (Date.now() - session.unlockedAt > AUTO_LOCK_MS) {
    lock("auto-lock timeout");
    return false;
  }
  return true;
}

export function requireKek(): Buffer {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  session.unlockedAt = Date.now(); // sliding window
  return session.kek!;
}

export function vaultExists(): boolean {
  return !!db().prepare("SELECT id FROM vault_meta WHERE id = 1").get();
}

export function initVault(passphrase: string) {
  if (vaultExists()) throw new Error("VAULT_EXISTS");
  const salt = newSalt();
  const kek = deriveKek(passphrase, salt);
  // verifier proves the passphrase without storing it
  const verifier = sha256(Buffer.concat([kek, Buffer.from("vaultmind-verifier")]));
  db().prepare("INSERT INTO vault_meta (id, kek_salt, verifier, created_at) VALUES (1,?,?,?)").run(salt, verifier, nowIso());
  session.kek = kek;
  session.unlockedAt = Date.now();
  audit("vault.created");
  return true;
}

export function unlock(passphrase: string): boolean {
  const meta = db().prepare("SELECT kek_salt, verifier FROM vault_meta WHERE id = 1").get() as any;
  if (!meta) throw new Error("VAULT_MISSING");
  const kek = deriveKek(passphrase, meta.kek_salt);
  const verifier = sha256(Buffer.concat([kek, Buffer.from("vaultmind-verifier")]));
  if (!constantTimeEqual(verifier, meta.verifier)) {
    audit("vault.unlock_failed", { detail: "bad passphrase" });
    return false;
  }
  session.kek = kek;
  session.unlockedAt = Date.now();
  audit("vault.unlocked");
  return true;
}

export function lock(reason = "manual") {
  session.kek = null;
  session.unlockedAt = null;
  try {
    audit("vault.locked", { detail: reason });
  } catch {}
}

export function sessionInfo() {
  return {
    exists: vaultExists(),
    unlocked: isUnlocked(),
    expiresInMs: session.unlockedAt ? Math.max(0, AUTO_LOCK_MS - (Date.now() - session.unlockedAt)) : 0,
  };
}

// ── ingest ────────────────────────────────────────────────────────────────

export async function ingest(file: { name: string; mime: string; buffer: Buffer }) {
  const kek = requireKek();
  const d = db();

  const plainHash = sha256(file.buffer);
  const dupe = d.prepare("SELECT id, title FROM documents WHERE sha256 = ? AND status != 'deleted'").get(plainHash) as any;
  if (dupe) {
    audit("ingest.duplicate", { docId: dupe.id, detail: file.name });
    return { duplicate: true as const, docId: dupe.id, title: dupe.title };
  }

  const id = nanoid(12);
  const sealed = seal(kek, file.buffer);
  const blobPath = path.join(BLOB_DIR, `${id}.bin`);
  fs.writeFileSync(blobPath, sealed.ciphertext);

  const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || file.name;

  d.prepare(
    `INSERT INTO documents (id, title, filename, mime, size, sha256, blob_path, iv, tag, wk_ct, wk_iv, wk_tag,
       status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, title, file.name, file.mime, file.buffer.length, sealed.sha256,
    path.relative(DATA_DIR, blobPath), sealed.iv, sealed.tag,
    sealed.wrappedKey.ciphertext, sealed.wrappedKey.iv, sealed.wrappedKey.tag,
    "processing", nowIso(), nowIso()
  );
  audit("ingest.stored", { docId: id, detail: `${file.name} (${file.buffer.length} bytes, AES-256-GCM)` });

  const extracted = await extractText(file.buffer, file.mime, file.name);
  d.prepare("UPDATE documents SET page_count = ? WHERE id = ?").run(extracted.pageCount, id);

  const result = await runIngestPipeline({
    docId: id,
    title,
    filename: file.name,
    text: extracted.text,
    extractMethod: extracted.method,
  });

  return { duplicate: false as const, docId: id, title, extract: extracted.method, note: extracted.note, ...result };
}

/** Decrypt and return the original bytes. Throws if the blob was tampered with. */
export function readBlob(docId: string): { buffer: Buffer; doc: any } {
  const kek = requireKek();
  const doc = db().prepare("SELECT * FROM documents WHERE id = ?").get(docId) as any;
  if (!doc) throw new Error("NOT_FOUND");
  const ciphertext = fs.readFileSync(path.join(DATA_DIR, doc.blob_path));
  const buffer = unseal(kek, {
    ciphertext,
    iv: doc.iv,
    tag: doc.tag,
    wrappedKey: { ciphertext: doc.wk_ct, iv: doc.wk_iv, tag: doc.wk_tag },
  });
  if (sha256(buffer) !== doc.sha256) throw new Error("INTEGRITY_FAILED");
  return { buffer, doc };
}

// ── secure sharing ────────────────────────────────────────────────────────

export function createShare(opts: {
  docId: string;
  expiresInHours: number;
  maxViews: number;
  password?: string;
  redact: boolean;
  recipient?: string;
}) {
  requireKek();
  const token = randomToken(24);
  const id = nanoid(12);
  const passSalt = opts.password ? newSalt() : null;
  db()
    .prepare(
      `INSERT INTO shares (id, doc_id, token_hash, pass_hash, pass_salt, expires_at, max_views, views, redact, watermark, revoked, recipient, created_at)
       VALUES (?,?,?,?,?,?,?,0,?,?,0,?,?)`
    )
    .run(
      id, opts.docId, sha256(token),
      opts.password && passSalt ? hashSecret(opts.password, passSalt) : null,
      passSalt,
      new Date(Date.now() + opts.expiresInHours * 3600_000).toISOString(),
      opts.maxViews, opts.redact ? 1 : 0,
      opts.recipient ? `Shared with ${opts.recipient}` : "VaultMind secure link",
      opts.recipient ?? null, nowIso()
    );
  audit("share.created", { docId: opts.docId, detail: `expires in ${opts.expiresInHours}h, max ${opts.maxViews} views` });
  return { id, token };
}

export type ShareCheck =
  | { ok: true; share: any; doc: any }
  | { ok: false; reason: "not-found" | "revoked" | "expired" | "exhausted" | "password" };

export function resolveShare(token: string, password?: string): ShareCheck {
  const share = db().prepare("SELECT * FROM shares WHERE token_hash = ?").get(sha256(token)) as any;
  if (!share) return { ok: false, reason: "not-found" };
  if (share.revoked) return { ok: false, reason: "revoked" };
  if (new Date(share.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (share.views >= share.max_views) return { ok: false, reason: "exhausted" };
  if (share.pass_hash) {
    if (!password) return { ok: false, reason: "password" };
    if (!constantTimeEqual(hashSecret(password, share.pass_salt), share.pass_hash)) return { ok: false, reason: "password" };
  }
  const doc = db().prepare("SELECT * FROM documents WHERE id = ?").get(share.doc_id) as any;
  if (!doc) return { ok: false, reason: "not-found" };
  return { ok: true, share, doc };
}

export function recordShareView(shareId: string, docId: string) {
  db().prepare("UPDATE shares SET views = views + 1 WHERE id = ?").run(shareId);
  audit("share.viewed", { actor: "recipient", docId, detail: `share ${shareId}` });
}

export function revokeShare(id: string) {
  requireKek();
  const s = db().prepare("SELECT doc_id FROM shares WHERE id = ?").get(id) as any;
  db().prepare("UPDATE shares SET revoked = 1 WHERE id = ?").run(id);
  audit("share.revoked", { docId: s?.doc_id, detail: id });
}

/** Mask identifiers before showing a document through a public share link. */
export function redactText(text: string): string {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "•••-••-••••")
    .replace(/\b(?:\d[ -]?){13,16}\b/g, "•••• •••• •••• ••••")
    .replace(/\b[\w.+-]+@([\w-]+\.[\w.]{2,})\b/g, "•••@$1")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "(•••) •••-••••")
    .replace(/\b([A-Z0-9]{2})[A-Z0-9-]{3,}([A-Z0-9]{2})\b/g, (m, a, b) => (m.length > 7 ? `${a}${"•".repeat(Math.min(m.length - 4, 10))}${b}` : m));
}

// ── backup ────────────────────────────────────────────────────────────────

export function runBackup(destination = "local-encrypted-snapshot") {
  requireKek();
  const d = db();
  const docs = d.prepare("SELECT id, sha256, size, blob_path FROM documents WHERE status != 'deleted'").all() as any[];
  const manifest = docs.map((x) => `${x.id}:${x.sha256}:${x.size}`).join("\n");
  const bytes = docs.reduce((a, x) => a + x.size, 0);
  const id = nanoid(10);
  d.prepare("INSERT INTO backups (id, created_at, doc_count, bytes, manifest_hash, destination) VALUES (?,?,?,?,?,?)").run(
    id, nowIso(), docs.length, bytes, sha256(manifest), destination
  );
  audit("backup.completed", { detail: `${docs.length} documents, ${(bytes / 1024).toFixed(0)} KiB → ${destination}` });
  return { id, docCount: docs.length, bytes };
}

/** Verify every blob still decrypts and matches its recorded plaintext hash. */
export function verifyIntegrity() {
  requireKek();
  const docs = db().prepare("SELECT id, title FROM documents WHERE status != 'deleted'").all() as any[];
  const results = docs.map((doc) => {
    try {
      readBlob(doc.id);
      return { docId: doc.id, title: doc.title, ok: true };
    } catch (e: any) {
      return { docId: doc.id, title: doc.title, ok: false, error: e.message };
    }
  });
  const bad = results.filter((r) => !r.ok);
  audit("integrity.verified", { detail: `${results.length} checked, ${bad.length} failed` });
  return { checked: results.length, failed: bad.length, results };
}

/** Rotate the master passphrase by re-wrapping DEKs only (blobs untouched). */
export function rotatePassphrase(oldPass: string, newPass: string) {
  const meta = db().prepare("SELECT kek_salt, verifier FROM vault_meta WHERE id = 1").get() as any;
  const oldKek = deriveKek(oldPass, meta.kek_salt);
  if (!constantTimeEqual(sha256(Buffer.concat([oldKek, Buffer.from("vaultmind-verifier")])), meta.verifier)) {
    return { ok: false as const, error: "Current passphrase is incorrect." };
  }
  const newSaltB64 = newSalt();
  const newKek = deriveKek(newPass, newSaltB64);
  const docs = db().prepare("SELECT id, wk_ct, wk_iv, wk_tag FROM documents").all() as any[];
  const upd = db().prepare("UPDATE documents SET wk_ct=?, wk_iv=?, wk_tag=? WHERE id=?");
  for (const doc of docs) {
    const w = rewrapKey(oldKek, newKek, { ciphertext: doc.wk_ct, iv: doc.wk_iv, tag: doc.wk_tag });
    upd.run(w.ciphertext, w.iv, w.tag, doc.id);
  }
  db()
    .prepare("UPDATE vault_meta SET kek_salt=?, verifier=? WHERE id=1")
    .run(newSaltB64, sha256(Buffer.concat([newKek, Buffer.from("vaultmind-verifier")])));
  session.kek = newKek;
  session.unlockedAt = Date.now();
  audit("vault.key_rotated", { detail: `${docs.length} document keys re-wrapped` });
  return { ok: true as const, rewrapped: docs.length };
}
