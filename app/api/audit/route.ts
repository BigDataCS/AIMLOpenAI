import { auditTrail } from "@/lib/dashboard";
import { verifyAuditChain } from "@/lib/db";
import { ok, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = guard();
  if (g) return g;
  return handle(() => ok({ entries: auditTrail(80), chain: verifyAuditChain() }));
}
