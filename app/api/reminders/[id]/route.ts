import { NextRequest } from "next/server";
import { db, audit } from "@/lib/db";
import { ok, guard, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { id } = await params;
    const { status, dueDate } = await req.json();
    if (status) db().prepare("UPDATE reminders SET status=? WHERE id=?").run(status, id);
    if (dueDate) db().prepare("UPDATE reminders SET due_date=? WHERE id=?").run(dueDate, id);
    audit("reminder.updated", { detail: `${id} → ${status ?? dueDate}` });
    return ok({});
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard();
  if (g) return g;
  return handle(async () => {
    const { id } = await params;
    db().prepare("DELETE FROM reminders WHERE id=?").run(id);
    audit("reminder.deleted", { detail: id });
    return ok({});
  });
}
