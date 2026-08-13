"use client";

import { useEffect, useState } from "react";
import { ClipboardType, Wand2, Copy, Check, FileText, Database } from "lucide-react";
import { Card, Badge, Empty, Button, Spinner, Confidence, relTime } from "../ui";

const SAMPLE = `Full Name: ____________________
Email Address: ____________________
Phone Number: ____________________
Home Address: ____________________
Employer: ____________________
Policy Number: ____________________
Account Number: ____________________
Emergency Contact: ____________________`;

export default function Autofill({ notify, openDoc }: any) {
  const [profile, setProfile] = useState<any[]>([]);
  const [formText, setFormText] = useState(SAMPLE);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/autofill").then((x) => x.json()).then((r) => r.ok && setProfile(r.profile));
  }, []);

  const run = async () => {
    setBusy(true);
    const r = await fetch("/api/autofill", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formText }),
    }).then((x) => x.json());
    setBusy(false);
    if (!r.ok) return notify(r.error, "err");
    setResult(r);
  };

  const copyFilled = () => {
    if (!result) return;
    const text = result.filled.map((f: any) => `${f.label}: ${f.value ?? ""}`).join("\n");
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    notify("Filled form copied to clipboard");
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-[12.5px] dim leading-relaxed max-w-2xl">
        As documents are ingested, the profile agent harvests reusable facts about you. Paste any form
        below and those facts are matched to its fields — with the source document shown for each value,
        so you can verify before you submit anything.
      </p>

      <Card title="What the vault knows about you"
        subtitle={`${profile.length} fields learned from your documents — nothing was typed in manually`}>
        {profile.length === 0 ? (
          <Empty icon={<Database size={24} />} title="No profile facts yet" hint="Upload a document containing your details." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-px" style={{ background: "var(--border)" }}>
            {profile.map((p) => (
              <div key={p.key} className="p-3.5" style={{ background: "var(--surface)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] uppercase tracking-wider dim font-medium">{p.label}</span>
                  <Confidence value={p.confidence} />
                </div>
                <div className="text-[13.5px] font-medium mt-1 truncate">{p.value}</div>
                {p.sourceTitle && (
                  <button onClick={() => openDoc(p.sourceDoc)}
                    className="text-[11.5px] mt-1 inline-flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                    <FileText size={10.5} /> {p.sourceTitle}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Paste a form"
          subtitle="Any text with labelled fields — 'Name: ____' style works best"
          action={<Button size="sm" variant="primary" onClick={run} disabled={busy}>
            {busy ? <Spinner /> : <Wand2 size={14} />} Fill it
          </Button>}>
          <div className="p-4">
            <textarea value={formText} onChange={(e) => setFormText(e.target.value)} rows={12}
              className="w-full rounded-lg px-3 py-2.5 text-[12.5px] mono resize-none leading-relaxed" />
          </div>
        </Card>

        <Card title="Filled result"
          subtitle={result ? `${Math.round(result.coverage * 100)}% of fields matched automatically` : "Run the autofill to see results"}
          action={result && <Button size="sm" onClick={copyFilled}>{copied ? <Check size={13} /> : <Copy size={13} />} Copy</Button>}>
          {!result ? (
            <Empty icon={<ClipboardType size={24} />} title="Nothing filled yet"
              hint="Paste a form on the left and hit 'Fill it'." />
          ) : (
            <ul className="divide-y">
              {result.filled.map((f: any) => (
                <li key={f.name} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] uppercase tracking-wider dim font-medium">{f.label}</span>
                    {f.value ? <Confidence value={f.confidence} /> : <Badge color="#b45309" bg="rgba(180,83,9,.12)">not found</Badge>}
                  </div>
                  <div className="text-[13.5px] font-medium mt-0.5">
                    {f.value ?? <span className="dim font-normal italic">Left blank — you'll need to complete this one</span>}
                  </div>
                  <div className="text-[11px] dim mt-1 leading-relaxed">
                    {f.source ? (
                      <button onClick={() => openDoc(f.source.docId)} className="inline-flex items-center gap-1 hover:underline">
                        <FileText size={10} /> from {f.source.title}
                      </button>
                    ) : f.reason}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
