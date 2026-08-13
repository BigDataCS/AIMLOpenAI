import { NextRequest } from "next/server";
import { sessionInfo, initVault, unlock, lock, rotatePassphrase } from "@/lib/vault";
import { ok, fail, handle } from "@/lib/api";
import { engineLabel, engineName } from "@/lib/ai/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => ok({ ...sessionInfo(), engine: { name: engineName(), label: engineLabel() } }));
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { action, passphrase, newPassphrase } = await req.json();
    switch (action) {
      case "init":
        if (!passphrase || passphrase.length < 8) return fail("Passphrase must be at least 8 characters.");
        initVault(passphrase);
        return ok({ ...sessionInfo() });
      case "unlock":
        if (!unlock(passphrase ?? "")) return fail("Incorrect passphrase.", 401);
        return ok({ ...sessionInfo() });
      case "lock":
        lock("user requested");
        return ok({ ...sessionInfo() });
      case "rotate": {
        if (!newPassphrase || newPassphrase.length < 8) return fail("New passphrase must be at least 8 characters.");
        const r = rotatePassphrase(passphrase ?? "", newPassphrase);
        return r.ok ? ok({ rewrapped: r.rewrapped }) : fail(r.error, 401);
      }
      default:
        return fail("Unknown action");
    }
  });
}
