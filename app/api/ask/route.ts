import { NextRequest } from "next/server";
import { askVault } from "@/lib/search";
import { audit } from "@/lib/db";
import { ok, fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { question } = await req.json();
    if (!question?.trim()) return fail("Ask a question first.");
    const r = await askVault(question);
    audit("assistant.question", { detail: question.slice(0, 120) });
    return ok(r);
  });
}
