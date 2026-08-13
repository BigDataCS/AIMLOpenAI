"use client";

import { useEffect, useState } from "react";
import { Cpu, Zap, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { Card, Badge, Empty, Spinner, Confidence, relTime } from "../ui";

const AGENT_DOC: Record<string, string> = {
  orchestrator: "Runs the ingestion pipeline and writes the final structured record back to the document.",
  classifier: "Assigns a category and subcategory using a weighted lexicon, reporting its margin over the runner-up.",
  "entity-extractor": "Pulls money, dates, parties, and identifiers out of the text and stores them for search.",
  summarizer: "Produces the executive summary and the plain-language explainer, with a readability grade.",
  tagger: "Derives searchable tags from the dominant terms, issuer, and year.",
  indexer: "Builds the FTS5 keyword index and the chunk embeddings used for semantic retrieval.",
  compliance: "Scans for PII and assigns the sensitivity tier that governs sharing and redaction.",
  "deadline-watcher": "Finds expiry and renewal language, then schedules a reminder with a type-appropriate lead time.",
  "profile-builder": "Harvests reusable facts about you for automatic form filling.",
};

export default function Agents({ data }: any) {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    fetch("/api/agents").then((x) => x.json()).then((r) => r.ok && setD(r));
  }, [data]);

  if (!d) return <div className="flex items-center gap-2 dim text-[13px]"><Spinner /> Loading agent telemetry…</div>;

  const maxMs = Math.max(1, ...d.stats.map((s: any) => s.avg_ms));

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-[12.5px] dim leading-relaxed max-w-2xl">
        Every upload passes through a mesh of narrow, auditable agents rather than one opaque call.
        Each records its engine, latency, and confidence — so when the vault makes a decision about your
        document, you can see exactly which agent made it and how sure it was.
      </p>

      <Card title="Agent performance" subtitle="Averaged across every run in this vault">
        <ul className="divide-y">
          {d.stats.map((s: any) => (
            <li key={s.agent} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <Cpu size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium mono">{s.agent}</div>
                  <div className="text-[11.5px] dim mt-0.5 leading-relaxed">{AGENT_DOC[s.agent] ?? "—"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="mono text-[12.5px] font-medium">{s.avg_ms}ms</div>
                  <div className="text-[11px] dim">{s.runs} runs</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb,var(--text-dim) 12%,transparent)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${(s.avg_ms / maxMs) * 100}%`, background: "var(--accent)" }} />
                </span>
                {s.avg_conf > 0 && <Confidence value={s.avg_conf} />}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Run log" subtitle="Most recent decisions, newest first">
        {d.runs.length === 0 ? (
          <Empty icon={<Sparkles size={24} />} title="No runs yet" />
        ) : (
          <ul className="divide-y max-h-[520px] overflow-y-auto">
            {d.runs.map((r: any) => (
              <li key={r.id} className="px-4 py-2.5 flex items-start gap-2.5">
                {r.status === "ok" ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "#059669" }} />
                ) : (
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#b45309" }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="mono text-[12px] font-medium">{r.agent}</span>
                    <span className="text-[12px] dim truncate max-w-[220px]">{r.title ?? "—"}</span>
                    <Badge>{r.engine}</Badge>
                    {r.status !== "ok" && <Badge color="#b45309" bg="rgba(180,83,9,.12)">{r.status}</Badge>}
                  </div>
                  {r.output && (
                    <div className="mono text-[11px] dim mt-1 truncate">
                      {Object.entries(r.output).slice(0, 4).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("  ")}
                    </div>
                  )}
                </div>
                {r.confidence != null && <Confidence value={r.confidence} />}
                <span className="mono text-[11px] dim w-12 text-right shrink-0">{Math.round(r.ms)}ms</span>
                <span className="text-[11px] dim w-16 text-right shrink-0 hidden sm:block">{relTime(r.started_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
