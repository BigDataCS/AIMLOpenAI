"use client";

import { useState } from "react";
import { FileCog, Download, FileText, FileJson, Table, FileType, Check } from "lucide-react";
import { Card, Badge, Empty, Button, Spinner, CategoryIcon } from "../ui";

const TARGETS = [
  { id: "pdf", label: "PDF", icon: FileType, desc: "Portable, printable, archival" },
  { id: "txt", label: "Plain text", icon: FileText, desc: "Raw extracted text" },
  { id: "md", label: "Markdown", icon: FileText, desc: "Text plus a metadata table" },
  { id: "json", label: "JSON", icon: FileJson, desc: "Structured fields for other systems" },
  { id: "csv", label: "CSV", icon: Table, desc: "Extracted entities as a spreadsheet" },
];

export default function Convert({ data, notify }: any) {
  const docs = data?.documents ?? [];
  const [docId, setDocId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (target: string) => {
    if (!docId) return notify("Choose a document first", "err");
    setBusy(target);
    const res = await fetch("/api/convert", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docId, target }),
    });
    if (!res.ok) {
      setBusy(null);
      const e = await res.json().catch(() => ({}));
      return notify(e.error || "Conversion failed", "err");
    }
    const blob = await res.blob();
    const name = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ?? `converted.${target}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
    setBusy(null); setDone(target);
    notify(`Converted to ${target.toUpperCase()} — downloading ${name}`);
    setTimeout(() => setDone(null), 2000);
  };

  const selected = docs.find((d: any) => d.id === docId);

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-[12.5px] dim leading-relaxed max-w-2xl">
        Conversion runs inside the vault — the file is decrypted in memory, transformed, and streamed
        straight to you. It is never uploaded to an external converter.
      </p>

      <Card title="Choose a document">
        <div className="p-4">
          <select value={docId} onChange={(e) => setDocId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[13px]">
            <option value="">Select a document…</option>
            {docs.map((d: any) => (
              <option key={d.id} value={d.id}>{d.title} ({d.filename.split(".").pop()?.toUpperCase()})</option>
            ))}
          </select>
          {selected && (
            <div className="mt-3 flex items-center gap-2.5 rounded-lg p-3 surface-2">
              <CategoryIcon category={selected.category} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">{selected.title}</div>
                <div className="text-[11.5px] dim">{selected.filename} · {selected.page_count} page{selected.page_count !== 1 && "s"}</div>
              </div>
              <Badge>{selected.mime}</Badge>
            </div>
          )}
        </div>
      </Card>

      <Card title="Convert to" subtitle="Structured formats include the AI-extracted metadata, not just the text">
        <div className="grid sm:grid-cols-2 gap-px" style={{ background: "var(--border)" }}>
          {TARGETS.map((t) => (
            <button key={t.id} onClick={() => run(t.id)} disabled={!docId || !!busy}
              className="flex items-center gap-3 p-3.5 text-left transition-colors disabled:opacity-40 hover:bg-[color-mix(in_srgb,var(--text-dim)_5%,transparent)]"
              style={{ background: "var(--surface)" }}>
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                {busy === t.id ? <Spinner /> : done === t.id ? <Check size={16} /> : <t.icon size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{t.label}</div>
                <div className="text-[11.5px] dim">{t.desc}</div>
              </div>
              <Download size={14} className="dim shrink-0" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
