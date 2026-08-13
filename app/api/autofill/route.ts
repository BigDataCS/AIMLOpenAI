import { NextRequest } from "next/server";
import { autofill, detectFields, profileSnapshot } from "@/lib/autofill";
import { audit } from "@/lib/db";
import { ok, fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = guard();
  if (g) return g;
  return handle(() => ok({ profile: profileSnapshot() }));
}

export async function POST(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { formText, fields } = await req.json();
    const detected = fields?.length ? fields : detectFields(formText ?? "");
    if (!detected.length) return fail("No fillable fields detected. Use lines like 'Full Name: ______'.");
    const r = autofill(detected);
    audit("autofill.run", { detail: `${detected.length} fields, ${(r.coverage * 100).toFixed(0)}% filled` });
    return ok(r);
  });
}
