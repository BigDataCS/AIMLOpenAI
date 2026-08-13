import { db } from "@/lib/db";
import { ok, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = guard();
  if (g) return g;
  return handle(() => {
    const runs = db()
      .prepare(
        `SELECT a.id, a.agent, a.status, a.engine, a.ms, a.confidence, a.started_at, a.output, d.title
           FROM agent_runs a LEFT JOIN documents d ON d.id = a.doc_id ORDER BY a.rowid DESC LIMIT 60`
      )
      .all() as any[];
    const stats = db()
      .prepare(
        `SELECT agent, COUNT(*) runs, ROUND(AVG(ms),1) avg_ms, ROUND(AVG(COALESCE(confidence,0)),3) avg_conf
           FROM agent_runs GROUP BY agent ORDER BY runs DESC`
      )
      .all();
    return ok({
      runs: runs.map((r) => ({ ...r, output: (() => { try { return JSON.parse(r.output); } catch { return null; } })() })),
      stats,
    });
  });
}
