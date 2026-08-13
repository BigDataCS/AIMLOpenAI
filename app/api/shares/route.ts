import { NextRequest } from "next/server";
import { createShare } from "@/lib/vault";
import { db } from "@/lib/db";
import { ok, fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = guard();
  if (g) return g;
  return handle(() =>
    ok({
      shares: db()
        .prepare(
          `SELECT s.id, s.doc_id, s.expires_at, s.max_views, s.views, s.revoked, s.recipient, s.redact, s.created_at,
                  d.title, d.category FROM shares s LEFT JOIN documents d ON d.id = s.doc_id ORDER BY s.created_at DESC`
        )
        .all(),
    })
  );
}

export async function POST(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const b = await req.json();
    if (!b.docId) return fail("docId is required.");
    const { id, token } = createShare({
      docId: b.docId,
      expiresInHours: Number(b.expiresInHours) || 24,
      maxViews: Number(b.maxViews) || 3,
      password: b.password || undefined,
      redact: b.redact !== false,
      recipient: b.recipient || undefined,
    });
    return ok({ id, token, url: `/share/${token}` });
  });
}
