import { NextRequest } from "next/server";
import { documentDetail } from "@/lib/dashboard";
import { readBlob } from "@/lib/vault";
import { db, audit } from "@/lib/db";
import { ok, fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { id } = await params;
    if (req.nextUrl.searchParams.get("download") === "1") {
      const { buffer, doc } = readBlob(id);
      audit("document.downloaded", { docId: id });
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": doc.mime || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
        },
      });
    }
    const doc = documentDetail(id);
    if (!doc) return fail("Not found", 404);
    audit("document.viewed", { docId: id });
    return ok({ document: doc });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { id } = await params;
    const body = await req.json();
    const d = db();
    if (typeof body.starred === "boolean") {
      d.prepare("UPDATE documents SET starred=? WHERE id=?").run(body.starred ? 1 : 0, id);
    }
    if (body.category) {
      d.prepare("UPDATE documents SET category=?, confidence=1.0 WHERE id=?").run(body.category, id);
      audit("document.recategorised", { docId: id, detail: `→ ${body.category} (human override)` });
    }
    if (body.title) d.prepare("UPDATE documents SET title=? WHERE id=?").run(body.title, id);
    return ok({});
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { id } = await params;
    db().prepare("UPDATE documents SET status='deleted' WHERE id=?").run(id);
    db().prepare("DELETE FROM doc_fts WHERE doc_id=?").run(id);
    audit("document.deleted", { docId: id });
    return ok({});
  });
}
