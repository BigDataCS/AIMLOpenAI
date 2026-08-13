import { NextResponse } from "next/server";
import { isUnlocked } from "./vault";

export const dynamic = "force-dynamic";

export function ok(data: any) {
  return NextResponse.json({ ok: true, ...data });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Guard for every route that touches plaintext or keys. */
export function guard(): NextResponse | null {
  if (!isUnlocked()) return NextResponse.json({ ok: false, error: "VAULT_LOCKED", locked: true }, { status: 401 });
  return null;
}

export function handle(fn: () => any | Promise<any>) {
  return Promise.resolve()
    .then(fn)
    .catch((e: any) => {
      const msg = e?.message || "Unexpected error";
      if (msg === "VAULT_LOCKED") return NextResponse.json({ ok: false, error: msg, locked: true }, { status: 401 });
      if (msg === "NOT_FOUND") return fail("Not found", 404);
      if (msg === "INTEGRITY_FAILED") return fail("Integrity check failed — this file may have been tampered with.", 409);
      console.error("[api]", e);
      return fail(msg, 500);
    });
}
