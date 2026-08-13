/**
 * Storage layer. Uses Node's built-in SQLite (node:sqlite) so the vault runs with
 * zero native build steps. Encrypted blobs live on disk under data/blobs/,
 * metadata + the FTS5 search index live in data/vault.db.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// VAULT_DATA_DIR lets the test suite run against a throwaway vault.
export const DATA_DIR = process.env.VAULT_DATA_DIR || path.join(process.cwd(), "data");
export const BLOB_DIR = path.join(DATA_DIR, "blobs");

// Held on globalThis so every route bundle (and dev-server hot reload) shares one
// connection instead of opening a competing handle on the same SQLite file.
const _g = globalThis as unknown as { __vaultdb__?: DatabaseSync };

export function db(): DatabaseSync {
  if (_g.__vaultdb__) return _g.__vaultdb__;
  fs.mkdirSync(BLOB_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "vault.db"));
  d.exec("PRAGMA journal_mode = WAL");
  d.exec("PRAGMA foreign_keys = ON");
  migrate(d);
  _g.__vaultdb__ = d;
  return d;
}

function migrate(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS vault_meta (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      kek_salt      TEXT NOT NULL,
      verifier      TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      filename      TEXT NOT NULL,
      mime          TEXT NOT NULL,
      size          INTEGER NOT NULL,
      sha256        TEXT NOT NULL,
      -- encryption envelope
      blob_path     TEXT NOT NULL,
      iv            TEXT NOT NULL,
      tag           TEXT NOT NULL,
      wk_ct         TEXT NOT NULL,
      wk_iv         TEXT NOT NULL,
      wk_tag        TEXT NOT NULL,
      -- AI-derived metadata
      category      TEXT NOT NULL DEFAULT 'Unsorted',
      subcategory   TEXT,
      summary       TEXT,
      plain_summary TEXT,
      sensitivity   TEXT NOT NULL DEFAULT 'internal',
      confidence    REAL NOT NULL DEFAULT 0,
      issuer        TEXT,
      doc_date      TEXT,
      expires_at    TEXT,
      amount        REAL,
      currency      TEXT,
      language      TEXT DEFAULT 'en',
      page_count    INTEGER DEFAULT 1,
      status        TEXT NOT NULL DEFAULT 'processing',
      starred       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doc_text (
      doc_id        TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      body          TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
      doc_id UNINDEXED, title, body, tags, entities,
      tokenize = 'porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS tags (
      doc_id        TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      tag           TEXT NOT NULL,
      source        TEXT NOT NULL DEFAULT 'ai',
      PRIMARY KEY (doc_id, tag)
    );

    CREATE TABLE IF NOT EXISTS entities (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id        TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL,
      value         TEXT NOT NULL,
      normalized    TEXT,
      confidence    REAL NOT NULL DEFAULT 0.8
    );
    CREATE INDEX IF NOT EXISTS idx_entities_doc ON entities(doc_id);
    CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind, normalized);

    CREATE TABLE IF NOT EXISTS chunks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id        TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ord           INTEGER NOT NULL,
      text          TEXT NOT NULL,
      vector        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);

    CREATE TABLE IF NOT EXISTS reminders (
      id            TEXT PRIMARY KEY,
      doc_id        TEXT REFERENCES documents(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      kind          TEXT NOT NULL DEFAULT 'expiry',
      due_date      TEXT NOT NULL,
      lead_days     INTEGER NOT NULL DEFAULT 30,
      status        TEXT NOT NULL DEFAULT 'open',
      notes         TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date, status);

    CREATE TABLE IF NOT EXISTS shares (
      id            TEXT PRIMARY KEY,
      doc_id        TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL,
      pass_hash     TEXT,
      pass_salt     TEXT,
      expires_at    TEXT NOT NULL,
      max_views     INTEGER NOT NULL DEFAULT 5,
      views         INTEGER NOT NULL DEFAULT 0,
      redact        INTEGER NOT NULL DEFAULT 1,
      watermark     TEXT,
      revoked       INTEGER NOT NULL DEFAULT 0,
      recipient     TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            TEXT NOT NULL,
      actor         TEXT NOT NULL,
      action        TEXT NOT NULL,
      doc_id        TEXT,
      detail        TEXT,
      prev_hash     TEXT NOT NULL,
      hash          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id            TEXT PRIMARY KEY,
      doc_id        TEXT,
      agent         TEXT NOT NULL,
      status        TEXT NOT NULL,
      input         TEXT,
      output        TEXT,
      engine        TEXT NOT NULL DEFAULT 'local',
      ms            INTEGER NOT NULL DEFAULT 0,
      confidence    REAL,
      started_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_doc ON agent_runs(doc_id);

    CREATE TABLE IF NOT EXISTS form_profile (
      key           TEXT PRIMARY KEY,
      value         TEXT NOT NULL,
      source_doc    TEXT,
      confidence    REAL NOT NULL DEFAULT 0.7,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id            TEXT PRIMARY KEY,
      created_at    TEXT NOT NULL,
      doc_count     INTEGER NOT NULL,
      bytes         INTEGER NOT NULL,
      manifest_hash TEXT NOT NULL,
      destination   TEXT NOT NULL
    );
  `);
}

export function nowIso() {
  return new Date().toISOString();
}

/** Append to the tamper-evident hash chain. */
export function audit(action: string, opts: { actor?: string; docId?: string | null; detail?: string } = {}) {
  const d = db();
  const prev = d.prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined;
  const prevHash = prev?.hash ?? "genesis";
  const ts = nowIso();
  const actor = opts.actor ?? "owner";
  const payload = JSON.stringify({ ts, actor, action, docId: opts.docId ?? null, detail: opts.detail ?? null });
  // lazy import avoids a cycle at module init
  const { chainHash } = require("./crypto") as typeof import("./crypto");
  const hash = chainHash(prevHash, payload);
  d.prepare(
    "INSERT INTO audit_log (ts, actor, action, doc_id, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?)"
  ).run(ts, actor, action, opts.docId ?? null, opts.detail ?? null, prevHash, hash);
  return hash;
}

/** Walk the audit chain and confirm nothing was edited or removed. */
export function verifyAuditChain(): { ok: boolean; entries: number; brokenAt?: number } {
  const { chainHash } = require("./crypto") as typeof import("./crypto");
  const rows = db().prepare("SELECT * FROM audit_log ORDER BY id ASC").all() as any[];
  let prevHash = "genesis";
  for (const r of rows) {
    const payload = JSON.stringify({ ts: r.ts, actor: r.actor, action: r.action, docId: r.doc_id, detail: r.detail });
    const expect = chainHash(prevHash, payload);
    if (expect !== r.hash || r.prev_hash !== prevHash) {
      return { ok: false, entries: rows.length, brokenAt: r.id };
    }
    prevHash = r.hash;
  }
  return { ok: true, entries: rows.length };
}
