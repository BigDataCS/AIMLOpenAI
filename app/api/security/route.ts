import { NextRequest } from "next/server";
import { runBackup, verifyIntegrity } from "@/lib/vault";
import { db } from "@/lib/db";
import { ok, fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const g = guard();
  if (g) return g;
  return handle(() =>
    ok({ backups: db().prepare("SELECT * FROM backups ORDER BY created_at DESC LIMIT 10").all() })
  );
}

export async function POST(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { action, destination } = await req.json();
    if (action === "backup") return ok({ backup: runBackup(destination || "local-encrypted-snapshot") });
    if (action === "verify") return ok({ integrity: verifyIntegrity() });
    return fail("Unknown action");
  });
}
