import { NextRequest } from "next/server";
import { revokeShare } from "@/lib/vault";
import { ok, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { id } = await params;
    revokeShare(id);
    return ok({});
  });
}
