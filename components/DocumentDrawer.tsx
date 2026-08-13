"use client";

import { useEffect, useState } from "react";
import {
  X, Download, Sparkles, Tag, ScrollText, Cpu, Clock, Trash2, FileText, BookOpen, Lightbulb,
} from "lucide-react";
import {
  Card, Badge, CategoryIcon, SensitivityBadge, Confidence, Button, Spinner, Markdown,
  fmtBytes, fmtMoney, relTime, daysUntil,
} from "./ui";

const TABS = [
  { id: "explain", label: "Plain English", icon: Lightbulb },
  { id: "facts", label: "Extracted facts", icon: Tag },
  { id: "text", label: "Full text", icon: BookOpen },
  { id: "agents", label: "How it was processed", icon: Cpu },
];

export default function DocumentDrawer({
  id, onClose, onChanged, notify,
}: { id: string; onClose: () => void; onChanged: () => void; notify: (m: string, t?: "ok" | "err") => void }) {
  const [doc, setDoc] = useState<any>(null);
  const [tab, setTab] = useState("explain");

  useEffect(() => {
    setDoc(null);
    fetch(`/api/documents/${id}`).then((x) => x.json()).then((r) => r.ok && setDoc(r.document));
  }, [id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const download = () => { window.location.href = `/api/documents/${id}?download=1`; };

  const remove = async () => {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    notify("Document removed from the vault");
    onChanged(); onClose();
  };

  const grouped = doc?.entities?.reduce((acc: any, e: any) => {
    (acc[e.kind] ??= []).push(e);
    return acc;
  }, {}) ?? {};

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}
      style={{ background: "color-mix(in srgb, #0a1020 42%, transparent)" }}>
      <div className="w-full max-w-2xl h-full overflow-y-auto animate-in shadow-2xl" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg)" }}>
        {!doc ? (
          <div className="flex items-center gap-2 dim text-[13px] p-6"><Spinner /> Decrypting…</div>
        ) : (
          <>
            <header className="sticky top-0 z-10 px-5 py-4 border-b backdrop-blur"
              style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}>
              <div className="flex items-start gap-3">
                <CategoryIcon category={doc.category} size={18} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15.5px] font-semibold tracking-tight leading-snug">{doc.title}</h2>
                  <div className="text-[11.5px] dim mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>{doc.filename}</span><span>·</span>
                    <span>{fmtBytes(doc.size)}</span><span>·</span>
                    <span>{doc.page_count} page{doc.page_count !== 1 && "s"}</span><span>·</span>
                    <span>added {relTime(doc.created_at)}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={onClose}><X size={15} /></Button>
              </div>

              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <Badge color="var(--accent)" bg="var(--accent-soft)">
                  {doc.category}{doc.subcategory ? ` · ${doc.subcategory}` : ""}
                </Badge>
                <SensitivityBadge level={doc.sensitivity} />
                {doc.issuer && <Badge>{doc.issuer}</Badge>}
                {doc.amount && <Badge>{fmtMoney(doc.amount)}</Badge>}
                {doc.expires_at && (
                  <Badge color={daysUntil(doc.expires_at) < 45 ? "#b45309" : undefined}
                    bg={daysUntil(doc.expires_at) < 45 ? "rgba(180,83,9,.12)" : undefined}>
                    <Clock size={10} /> expires {doc.expires_at} ({daysUntil(doc.expires_at)}d)
                  </Badge>
                )}
                <span className="ml-auto"><Confidence value={doc.confidence} /></span>
              </div>

              <div className="flex items-center gap-1.5 mt-3">
                <Button size="sm" onClick={download}><Download size={13} /> Download original</Button>
                <Button size="sm" variant="ghost" onClick={remove} className="ml-auto" title="Remove from vault">
                  <Trash2 size={13} />
                </Button>
              </div>
            </header>

            <div className="px-5 pt-3">
              <div className="flex gap-0.5 border-b">
                {TABS.map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium border-b-2 -mb-px transition-colors"
                    style={{
                      borderColor: tab === t.id ? "var(--accent)" : "transparent",
                      color: tab === t.id ? "var(--accent)" : "var(--text-dim)",
                    }}>
                    <t.icon size={13} /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {tab === "explain" && (
                <>
                  <Card title="Summary" subtitle="Extracted by the summariser agent">
                    <p className="px-4 py-3.5 text-[13px] leading-relaxed">{doc.summary}</p>
                  </Card>
                  <Card title="In plain English" subtitle="Jargon decoded, obligations surfaced">
                    <div className="px-4 py-3.5">
                      <Markdown text={doc.plain_summary ?? "—"} />
                    </div>
                  </Card>
                  {!!doc.tags?.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {doc.tags.map((t: string) => <Badge key={t}>#{t}</Badge>)}
                    </div>
                  )}
                </>
              )}

              {tab === "facts" && (
                <>
                  {Object.keys(grouped).length === 0 ? (
                    <Card><p className="p-4 text-[13px] dim">No entities were extracted from this document.</p></Card>
                  ) : (
                    Object.entries(grouped).map(([kind, list]: any) => (
                      <Card key={kind} title={kind.replace(/_/g, " ")} subtitle={`${list.length} found`}>
                        <ul className="divide-y">
                          {list.map((e: any, i: number) => (
                            <li key={i} className="px-4 py-2 flex items-center gap-3">
                              <span className="text-[13px] flex-1 truncate">{e.value}</span>
                              {e.normalized && e.normalized !== e.value && (
                                <span className="mono text-[11.5px] dim">→ {e.normalized}</span>
                              )}
                              <Confidence value={e.confidence} />
                            </li>
                          ))}
                        </ul>
                      </Card>
                    ))
                  )}
                  {!!doc.reminders?.length && (
                    <Card title="Scheduled reminders">
                      <ul className="divide-y">
                        {doc.reminders.map((r: any) => (
                          <li key={r.id} className="px-4 py-2.5 text-[12.5px] flex items-center gap-2">
                            <Clock size={12} className="dim" />
                            <span className="flex-1">{r.title}</span>
                            <Badge>{r.due_date}</Badge>
                            <Badge>{r.lead_days}d lead</Badge>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </>
              )}

              {tab === "text" && (
                <Card title="Extracted text" subtitle="Decrypted in memory for this view only">
                  <pre className="px-4 py-3.5 text-[12px] mono whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
                    {doc.text || "No text layer — this document needs OCR."}
                  </pre>
                </Card>
              )}

              {tab === "agents" && (
                <Card title="Processing pipeline" subtitle="Every agent that touched this document">
                  <ul className="divide-y">
                    {doc.runs.map((r: any, i: number) => (
                      <li key={i} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="mono text-[12px] font-medium">{r.agent}</span>
                          <Badge>{r.engine}</Badge>
                          {r.status !== "ok" && <Badge color="#b45309" bg="rgba(180,83,9,.12)">{r.status}</Badge>}
                          <span className="ml-auto mono text-[11px] dim">{Math.round(r.ms)}ms</span>
                        </div>
                        {r.output && (
                          <div className="mono text-[11px] dim mt-1 break-all leading-relaxed">
                            {JSON.stringify(r.output).slice(0, 260)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
