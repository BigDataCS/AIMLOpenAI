import { NextRequest } from "next/server";
import { ingest } from "@/lib/vault";
import { ok, fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return fail("No files supplied.");

    const results = [];
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        results.push({ filename: f.name, error: "File exceeds the 25 MB limit." });
        continue;
      }
      const buffer = Buffer.from(await f.arrayBuffer());
      const r = await ingest({ name: f.name, mime: f.type || "application/octet-stream", buffer });
      results.push({ filename: f.name, ...r });
    }
    return ok({ results });
  });
}
