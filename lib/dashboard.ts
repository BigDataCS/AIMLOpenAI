import { db } from "./db";
import { engineLabel, engineName } from "./ai/engine";
import { verifyAuditChain } from "./db";

export function overview() {
  const d = db();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);

  const docs = d.prepare("SELECT COUNT(*) n, COALESCE(SUM(size),0) bytes FROM documents WHERE status != 'deleted'").get() as any;
  const byCategory = d
    .prepare("SELECT category, COUNT(*) n FROM documents WHERE status != 'deleted' GROUP BY category ORDER BY n DESC")
    .all() as any[];
  const bySensitivity = d
    .prepare("SELECT sensitivity, COUNT(*) n FROM documents WHERE status != 'deleted' GROUP BY sensitivity")
    .all() as any[];
  const needsAttention = d
    .prepare("SELECT COUNT(*) n FROM documents WHERE status IN ('needs-ocr','processing')")
    .get() as any;

  const expiringSoon = d
    .prepare(
      `SELECT r.id, r.title, r.due_date, r.kind, r.lead_days, r.status, d.id doc_id, d.category
         FROM reminders r LEFT JOIN documents d ON d.id = r.doc_id
        WHERE r.status = 'open' AND r.due_date >= ? AND r.due_date <= ?
        ORDER BY r.due_date ASC`
    )
    .all(today, in90) as any[];

  const overdue = d
    .prepare(
      `SELECT r.id, r.title, r.due_date, r.kind, d.id doc_id FROM reminders r LEFT JOIN documents d ON d.id = r.doc_id
        WHERE r.status = 'open' AND r.due_date < ? ORDER BY r.due_date DESC`
    )
    .all(today) as any[];

  const financial = d
    .prepare(
      `SELECT category, COUNT(*) n, COALESCE(SUM(amount),0) total FROM documents
        WHERE amount IS NOT NULL AND status != 'deleted' GROUP BY category ORDER BY total DESC`
    )
    .all() as any[];

  const monthly = d
    .prepare(
      `SELECT substr(doc_date,1,7) month, COUNT(*) n, COALESCE(SUM(amount),0) total
         FROM documents WHERE doc_date IS NOT NULL AND status != 'deleted'
        GROUP BY month ORDER BY month`
    )
    .all() as any[];

  const agents = d
    .prepare(
      `SELECT agent, COUNT(*) runs, ROUND(AVG(ms),1) avg_ms, ROUND(AVG(COALESCE(confidence,0)),3) avg_conf,
              SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) ok
         FROM agent_runs GROUP BY agent ORDER BY runs DESC`
    )
    .all() as any[];

  const recentRuns = d
    .prepare(
      `SELECT a.id, a.agent, a.status, a.engine, a.ms, a.confidence, a.started_at, a.output, d.title
         FROM agent_runs a LEFT JOIN documents d ON d.id = a.doc_id ORDER BY a.rowid DESC LIMIT 12`
    )
    .all() as any[];

  const lastBackup = d.prepare("SELECT * FROM backups ORDER BY created_at DESC LIMIT 1").get() as any;
  const shares = d.prepare("SELECT COUNT(*) n FROM shares WHERE revoked = 0 AND expires_at > ?").get(new Date().toISOString()) as any;
  const chain = verifyAuditChain();

  const totalMs = (d.prepare("SELECT COALESCE(SUM(ms),0) t FROM agent_runs").get() as any).t;

  return {
    documents: docs.n,
    bytes: docs.bytes,
    byCategory,
    bySensitivity,
    needsAttention: needsAttention.n,
    expiring30: expiringSoon.filter((r) => r.due_date <= in30).length,
    expiringSoon,
    overdue,
    financial,
    monthly,
    agents,
    recentRuns: recentRuns.map((r) => ({ ...r, output: safeParse(r.output) })),
    lastBackup,
    activeShares: shares.n,
    auditChain: chain,
    engine: { name: engineName(), label: engineLabel() },
    totalAgentMs: totalMs,
  };
}

function safeParse(s: string | null) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function listDocuments(filter: { category?: string; sensitivity?: string; q?: string } = {}) {
  const d = db();
  const where: string[] = ["status != 'deleted'"];
  const args: any[] = [];
  if (filter.category) {
    where.push("category = ?");
    args.push(filter.category);
  }
  if (filter.sensitivity) {
    where.push("sensitivity = ?");
    args.push(filter.sensitivity);
  }
  const rows = d
    .prepare(`SELECT * FROM documents WHERE ${where.join(" AND ")} ORDER BY created_at DESC`)
    .all(...args) as any[];
  const tags = d.prepare("SELECT doc_id, tag FROM tags").all() as any[];
  const tagMap = new Map<string, string[]>();
  for (const t of tags) tagMap.set(t.doc_id, [...(tagMap.get(t.doc_id) ?? []), t.tag]);
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export function documentDetail(id: string) {
  const d = db();
  const doc = d.prepare("SELECT * FROM documents WHERE id = ?").get(id) as any;
  if (!doc) return null;
  const entities = d.prepare("SELECT kind, value, normalized, confidence FROM entities WHERE doc_id = ? ORDER BY kind").all(id) as any[];
  const tags = (d.prepare("SELECT tag FROM tags WHERE doc_id = ?").all(id) as any[]).map((t) => t.tag);
  const runs = d.prepare("SELECT agent, status, engine, ms, confidence, output, started_at FROM agent_runs WHERE doc_id = ? ORDER BY rowid").all(id) as any[];
  const reminders = d.prepare("SELECT * FROM reminders WHERE doc_id = ?").all(id) as any[];
  const shares = d.prepare("SELECT id, expires_at, max_views, views, revoked, recipient, redact, created_at FROM shares WHERE doc_id = ? ORDER BY created_at DESC").all(id) as any[];
  const text = (d.prepare("SELECT body FROM doc_text WHERE doc_id = ?").get(id) as any)?.body ?? "";
  return {
    ...doc,
    entities,
    tags,
    runs: runs.map((r) => ({ ...r, output: safeParse(r.output) })),
    reminders,
    shares,
    text,
  };
}

export function auditTrail(limit = 60) {
  return db()
    .prepare(
      `SELECT a.id, a.ts, a.actor, a.action, a.detail, a.hash, d.title
         FROM audit_log a LEFT JOIN documents d ON d.id = a.doc_id ORDER BY a.id DESC LIMIT ?`
    )
    .all(limit) as any[];
}

export function listReminders() {
  return db()
    .prepare(
      `SELECT r.*, d.category, d.title doc_title FROM reminders r LEFT JOIN documents d ON d.id = r.doc_id
        ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.due_date ASC`
    )
    .all() as any[];
}
