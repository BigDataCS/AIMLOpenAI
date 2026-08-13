import { NextRequest } from "next/server";
import { convert, type Target } from "@/lib/convert";
import { audit } from "@/lib/db";
import { fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const TARGETS = ["pdf", "txt", "md", "csv", "json"];

export async function POST(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { docId, target } = await req.json();
    if (!docId || !TARGETS.includes(target)) return fail("docId and a valid target format are required.");
    const r = await convert(docId, target as Target);
    audit("document.converted", { docId, detail: `→ ${target}` });
    return new Response(new Uint8Array(r.body), {
      headers: {
        "Content-Type": r.mime,
        "Content-Disposition": `attachment; filename="${r.filename.replace(/"/g, "")}"`,
      },
    });
  });
}
