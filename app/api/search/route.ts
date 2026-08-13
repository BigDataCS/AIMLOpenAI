import { NextRequest } from "next/server";
import { search } from "@/lib/search";
import { audit } from "@/lib/db";
import { ok, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(() => {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const r = search(q, 30);
    if (q.trim()) audit("search.query", { detail: q.slice(0, 120) });
    return ok(r);
  });
}
