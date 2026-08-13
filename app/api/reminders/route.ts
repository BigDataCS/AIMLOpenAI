import { NextRequest } from "next/server";
import { listReminders } from "@/lib/dashboard";
import { db, nowIso, audit } from "@/lib/db";
import { nanoid } from "nanoid";
import { ok, fail, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = guard();
  if (g) return g;
  return handle(() => ok({ reminders: listReminders() }));
}

export async function POST(req: NextRequest) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const b = await req.json();
    if (!b.title || !b.dueDate) return fail("Title and due date are required.");
    const id = nanoid(12);
    db().prepare(
      "INSERT INTO reminders (id, doc_id, title, kind, due_date, lead_days, status, notes, created_at) VALUES (?,?,?,?,?,?,'open',?,?)"
    ).run(id, b.docId ?? null, b.title, b.kind ?? "custom", b.dueDate, b.leadDays ?? 30, b.notes ?? null, nowIso());
    audit("reminder.created", { docId: b.docId ?? null, detail: `${b.title} due ${b.dueDate}` });
    return ok({ id });
  });
}
