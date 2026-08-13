"use client";

import { useEffect, useState } from "react";
import { Share2, Copy, Ban, Eye, Clock, Lock, EyeOff, Check } from "lucide-react";
import { Card, Badge, Empty, Button, Spinner, relTime, CategoryIcon } from "../ui";

export default function Sharing({ data, notify, openDoc }: any) {
  const docs = data?.documents ?? [];
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({ docId: "", expiresInHours: 24, maxViews: 3, password: "", redact: true, recipient: "" });
  const [created, setCreated] = useState<{ url: string; token: string } | null>(null);

  const load = async () => {
    const r = await fetch("/api/shares").then((x) => x.json());
    if (r.ok) setShares(r.shares);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.docId) return notify("Choose a document first", "err");
    const r = await fetch("/api/shares", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then((x) => x.json());
    if (r.ok) {
      setCreated({ url: window.location.origin + r.url, token: r.token });
      notify("Secure link created");
      load();
    } else notify(r.error, "err");
  };

  const revoke = async (id: string) => {
    await fetch(`/api/shares/${id}`, { method: "DELETE" });
    notify("Link revoked — it stops working immediately");
    load();
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-[12.5px] dim leading-relaxed max-w-2xl">
        Share a document without handing over the file. Links carry their own expiry, a view cap, an optional
        password, and automatic redaction of identifiers — and can be killed instantly at any time.
      </p>

      <Card title="Create a secure link">
        <div className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-2.5">
            <label className="block">
              <span className="text-[11.5px] dim font-medium">Document</span>
              <select value={form.docId} onChange={(e) => setForm({ ...form, docId: e.target.value })}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-[13px]">
                <option value="">Select a document…</option>
                {docs.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11.5px] dim font-medium">Recipient (for the audit trail)</span>
              <input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                placeholder="e.g. mortgage broker" className="mt-1 w-full rounded-lg px-3 py-2 text-[13px]" />
            </label>
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            <label className="block">
              <span className="text-[11.5px] dim font-medium">Expires after</span>
              <select value={form.expiresInHours} onChange={(e) => setForm({ ...form, expiresInHours: +e.target.value })}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-[13px]">
                <option value={1}>1 hour</option><option value={24}>24 hours</option>
                <option value={72}>3 days</option><option value={168}>7 days</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11.5px] dim font-medium">View limit</span>
              <select value={form.maxViews} onChange={(e) => setForm({ ...form, maxViews: +e.target.value })}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-[13px]">
                <option value={1}>1 view</option><option value={3}>3 views</option>
                <option value={10}>10 views</option><option value={50}>50 views</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11.5px] dim font-medium">Password (optional)</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Extra protection" className="mt-1 w-full rounded-lg px-3 py-2 text-[13px]" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={form.redact} onChange={(e) => setForm({ ...form, redact: e.target.checked })}
                className="w-3.5 h-3.5 accent-[var(--accent)]" />
              <EyeOff size={13} className="dim" />
              Redact identifiers (SSNs, card numbers, emails, phone numbers)
            </label>
            <Button variant="primary" onClick={create}><Share2 size={14} /> Create link</Button>
          </div>

          {created && (
            <div className="rounded-lg p-3 animate-in" style={{ background: "var(--accent-soft)" }}>
              <div className="text-[11.5px] font-medium accent mb-1.5">Link ready — copy it now, the token is not shown again</div>
              <div className="flex items-center gap-2">
                <code className="mono text-[11.5px] flex-1 truncate px-2 py-1.5 rounded" style={{ background: "var(--surface)" }}>
                  {created.url}
                </code>
                <Button size="sm" onClick={() => copy(created.url, "new")}>
                  {copied === "new" ? <Check size={13} /> : <Copy size={13} />} {copied === "new" ? "Copied" : "Copy"}
                </Button>
                <a href={created.url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost">Preview</Button>
                </a>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Active & past links" subtitle="Every view is written to the audit chain">
        {loading ? (
          <div className="p-4 flex items-center gap-2 dim text-[13px]"><Spinner /> Loading…</div>
        ) : shares.length === 0 ? (
          <Empty icon={<Share2 size={24} />} title="No links created yet" hint="Links you create appear here with live view counts." />
        ) : (
          <ul className="divide-y">
            {shares.map((s) => {
              const expired = new Date(s.expires_at) < new Date();
              const dead = s.revoked || expired || s.views >= s.max_views;
              return (
                <li key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                  <CategoryIcon category={s.category ?? "Unsorted"} size={13} />
                  <div className="min-w-0 flex-1">
                    <button onClick={() => openDoc(s.doc_id)} className="text-[13px] font-medium truncate hover:underline block text-left max-w-full">
                      {s.title}
                    </button>
                    <div className="text-[11.5px] dim mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Eye size={10.5} /> {s.views}/{s.max_views}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={10.5} /> {expired ? "expired" : `expires ${relTime(s.expires_at)}`}</span>
                      {!!s.redact && <Badge><EyeOff size={9.5} /> redacted</Badge>}
                      {s.recipient && <Badge>{s.recipient}</Badge>}
                    </div>
                  </div>
                  {dead ? (
                    <Badge color="#be123c" bg="rgba(190,18,60,.12)">
                      {s.revoked ? "revoked" : expired ? "expired" : "view limit reached"}
                    </Badge>
                  ) : (
                    <>
                      <Badge color="#047857" bg="rgba(4,120,87,.12)">active</Badge>
                      <Button size="sm" variant="ghost" onClick={() => revoke(s.id)} title="Revoke immediately">
                        <Ban size={13} /> Revoke
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
