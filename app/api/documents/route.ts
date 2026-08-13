import { NextRequest } from "next/server";
import { listDocuments, overview } from "@/lib/dashboard";
import { ok, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(() => {
    const sp = req.nextUrl.searchParams;
    return ok({
      documents: listDocuments({
        category: sp.get("category") || undefined,
        sensitivity: sp.get("sensitivity") || undefined,
      }),
      overview: overview(),
    });
  });
}
