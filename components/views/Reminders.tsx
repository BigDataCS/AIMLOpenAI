"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Plus, Trash2, CalendarClock, AlarmClock } from "lucide-react";
import { Card, Badge, Empty, Button, Spinner, daysUntil, CategoryIcon } from "../ui";

export default function Reminders({ data, refresh, notify, openDoc }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", dueDate: "", leadDays: 30 });

  const load = async () => {
    const r = await fetch("/api/reminders").then((x) => x.json());
    if (r.ok) setItems(r.reminders);
    setLoading(false);
  };
  useEffect(() => { load(); }, [data]);

  const act = async (id: string, body: any) => {
    await fetch(`/api/reminders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load(); refresh();
  };
  const del = async (id: string) => {
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    load(); refresh();
  };
  const create = async () => {
    if (!form.title || !form.dueDate) return;
    const r = await fetch("/api/reminders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, kind: "custom" }),
    }).then((x) => x.json());
    if (r.ok) { notify("Reminder created"); setForm({ title: "", dueDate: "", leadDays: 30 }); setAdding(false); load(); refresh(); }
  };

  const open = items.filter((r) => r.status === "open");
  const overdue = open.filter((r) => daysUntil(r.due_date) < 0);
  const soon = open.filter((r) => { const d = daysUntil(r.due_date); return d >= 0 && d <= 60; });
  const later = open.filter((r) => daysUntil(r.due_date) > 60);
  const done = items.filter((r) => r.status !== "open");

  if (loading) return <div className="flex items-center gap-2 dim text-[13px]"><Spinner /> Loading renewals…</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] dim max-w-xl leading-relaxed">
          The deadline agent reads expiry, renewal, and due-date language out of every document it ingests
          and schedules these automatically. Lead times adapt to the document type — passports get 90 days, bills get 30.
        </p>
        <Button size="sm" variant="primary" onClick={() => setAdding(!adding)}><Plus size={14} /> Add</Button>
      </div>

      {adding && (
        <Card className="animate-in">
          <div className="p-4 grid sm:grid-cols-[1fr_150px_110px_auto] gap-2.5 items-end">
            <label className="block">
              <span className="text-[11.5px] dim font-medium">What needs renewing?</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Professional licence renewal" className="mt-1 w-full rounded-lg px-3 py-2 text-[13px]" />
            </label>
            <label className="block">
              <span className="text-[11.5px] dim font-medium">Due date</span>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-[13px]" />
            </label>
            <label className="block">
              <span className="text-[11.5px] dim font-medium">Warn me</span>
              <select value={form.leadDays} onChange={(e) => setForm({ ...form, leadDays: +e.target.value })}
                className="mt-1 w-full rounded-lg px-2 py-2 text-[13px]">
                <option value={7}>7 days</option><option value={30}>30 days</option>
                <option value={60}>60 days</option><option value={90}>90 days</option>
              </select>
            </label>
            <Button variant="primary" onClick={create}>Create</Button>
          </div>
        </Card>
      )}

      {open.length === 0 && done.length === 0 && (
        <Card><Empty icon={<Bell size={24} />} title="No renewals tracked yet"
          hint="Upload a policy, passport, or contract — expiry dates are detected and scheduled automatically." /></Card>
      )}

      {overdue.length > 0 && <Group title="Overdue" tone="#be123c" items={overdue} act={act} del={del} openDoc={openDoc} />}
      {soon.length > 0 && <Group title="Next 60 days" tone="#b45309" items={soon} act={act} del={del} openDoc={openDoc} />}
      {later.length > 0 && <Group title="Later" items={later} act={act} del={del} openDoc={openDoc} />}
      {done.length > 0 && <Group title="Completed" items={done} act={act} del={del} openDoc={openDoc} muted />}
    </div>
  );
}

function Group({ title, items, tone, act, del, openDoc, muted }: any) {
  return (
    <Card title={title} subtitle={`${items.length} item${items.length !== 1 ? "s" : ""}`}>
      <ul className="divide-y">
        {items.map((r: any) => {
          const d = daysUntil(r.due_date);
          const c = tone ?? "var(--text-dim)";
          return (
            <li key={r.id} className="px-4 py-2.5 flex items-center gap-3 group" style={{ opacity: muted ? 0.55 : 1 }}>
              <span className="w-1.5 h-9 rounded-full shrink-0" style={{ background: c, opacity: 0.75 }} />
              {r.category && <CategoryIcon category={r.category} size={13} />}
              <div className="min-w-0 flex-1">
                <button onClick={() => r.doc_id && openDoc(r.doc_id)}
                  className="text-[13px] font-medium truncate hover:underline text-left block max-w-full">
                  {r.title}
                </button>
                <div className="text-[11.5px] dim mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <CalendarClock size={11} />
                  {new Date(r.due_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                  <Badge>{r.kind}</Badge>
                  {r.notes && <span className="truncate max-w-[280px] italic">{r.notes}</span>}
                </div>
              </div>
              <span className="mono text-[11.5px] font-medium shrink-0" style={{ color: c }}>
                {r.status !== "open" ? "done" : d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "today" : `${d}d`}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {r.status === "open" && (
                  <Button size="sm" variant="ghost" onClick={() => act(r.id, { status: "done" })} title="Mark as done">
                    <Check size={13} />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => del(r.id)} title="Delete"><Trash2 size={13} /></Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
