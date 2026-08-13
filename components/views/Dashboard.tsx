"use client";

import {
  FileStack, ShieldCheck, AlertTriangle, Clock, Sparkles, ArrowRight, HardDriveDownload,
  Cpu, TrendingUp, CheckCircle2,
} from "lucide-react";
import {
  Card, Stat, Badge, CategoryIcon, SensitivityBadge, Empty, Button,
  fmtBytes, fmtMoney, relTime, daysUntil, Confidence,
} from "../ui";

export default function Dashboard({ data, openDoc, go }: any) {
  const ov = data?.overview;
  const docs = data?.documents ?? [];
  if (!ov) return null;

  const maxCat = Math.max(1, ...ov.byCategory.map((c: any) => c.n));
  const totalTracked = ov.financial.reduce((a: number, f: any) => a + f.total, 0);
  const urgent = [...ov.overdue.map((r: any) => ({ ...r, overdue: true })), ...ov.expiringSoon].slice(0, 6);

  return (
    <div className="space-y-5">
      {/* stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Documents" value={ov.documents} sub={`${fmtBytes(ov.bytes)} encrypted at rest`}
          icon={<FileStack size={15} className="dim" />} />
        <Stat label="Renewals ahead" value={ov.expiringSoon.length}
          sub={ov.overdue.length ? `${ov.overdue.length} already overdue` : "Nothing overdue"}
          tone={ov.overdue.length ? "#be123c" : undefined}
          icon={<Clock size={15} className="dim" />} />
        <Stat label="Value tracked" value={fmtMoney(totalTracked)} sub="Extracted from financial documents"
          icon={<TrendingUp size={15} className="dim" />} />
        <Stat label="Agent runs" value={ov.agents.reduce((a: number, x: any) => a + x.runs, 0)}
          sub={`${(ov.totalAgentMs / 1000).toFixed(1)}s total compute`}
          icon={<Cpu size={15} className="dim" />} />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5">
        {/* needs attention */}
        <Card title="Needs your attention"
          subtitle="Deadlines the vault found on its own — no manual entry"
          action={<Button size="sm" variant="ghost" onClick={() => go("reminders")}>All renewals <ArrowRight size={13} /></Button>}>
          {urgent.length === 0 ? (
            <Empty icon={<CheckCircle2 size={24} />} title="Nothing needs you right now"
              hint="Expiry dates found in new uploads will appear here automatically." />
          ) : (
            <ul className="divide-y">
              {urgent.map((r: any) => {
                const d = daysUntil(r.due_date);
                const tone = r.overdue || d < 0 ? "#be123c" : d <= 30 ? "#b45309" : "var(--text-dim)";
                return (
                  <li key={r.id}>
                    <button onClick={() => r.doc_id && openDoc(r.doc_id)}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[color-mix(in_srgb,var(--text-dim)_5%,transparent)] transition-colors">
                      <span className="w-1.5 h-9 rounded-full shrink-0" style={{ background: tone, opacity: .8 }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{r.title}</div>
                        <div className="text-[11.5px] dim mt-0.5">
                          {new Date(r.due_date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                          {r.kind && <> · {r.kind}</>}
                        </div>
                      </div>
                      <span className="text-[11.5px] font-medium mono shrink-0" style={{ color: tone }}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "today" : `${d}d`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* library breakdown */}
        <Card title="How your vault is organised" subtitle="Filed automatically by the classifier agent">
          <div className="p-4 space-y-2">
            {ov.byCategory.map((c: any) => (
              <button key={c.category} onClick={() => go("documents")}
                className="w-full flex items-center gap-2.5 group">
                <CategoryIcon category={c.category} size={13} />
                <span className="text-[12.5px] font-medium w-[86px] text-left truncate">{c.category}</span>
                <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb,var(--text-dim) 12%,transparent)" }}>
                  <span className="block h-full rounded-full transition-all group-hover:brightness-110"
                    style={{ width: `${(c.n / maxCat) * 100}%`, background: "var(--accent)" }} />
                </span>
                <span className="mono text-[11.5px] dim w-4 text-right">{c.n}</span>
              </button>
            ))}
          </div>
          <div className="px-4 pb-4 pt-1 flex flex-wrap gap-1.5 border-t mt-1">
            <span className="text-[11.5px] dim w-full mt-2.5 mb-0.5">Sensitivity tiers assigned by the compliance agent</span>
            {ov.bySensitivity.map((s: any) => (
              <span key={s.sensitivity} className="inline-flex items-center gap-1">
                <SensitivityBadge level={s.sensitivity} />
                <span className="mono text-[11px] dim">×{s.n}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.35fr] gap-5">
        {/* security posture */}
        <Card title="Security posture">
          <div className="p-4 space-y-3">
            <Row ok label="Envelope encryption" value="AES-256-GCM per file" />
            <Row ok label="Key derivation" value="scrypt · N=16384" />
            <Row ok={ov.auditChain.ok} label="Audit chain"
              value={ov.auditChain.ok ? `${ov.auditChain.entries} entries verified` : "TAMPERING DETECTED"} />
            <Row ok={!!ov.lastBackup} label="Last backup"
              value={ov.lastBackup ? `${relTime(ov.lastBackup.created_at)} · ${ov.lastBackup.doc_count} docs` : "Never"} />
            <Row ok label="Active share links" value={`${ov.activeShares} live`} />
            <Row ok={ov.needsAttention === 0} label="Processing queue"
              value={ov.needsAttention === 0 ? "All documents indexed" : `${ov.needsAttention} awaiting OCR`} />
            <Button size="sm" className="w-full mt-1" onClick={() => go("security")}>
              <ShieldCheck size={14} /> Open security centre
            </Button>
          </div>
        </Card>

        {/* recent agent activity */}
        <Card title="Recent agent activity"
          subtitle="Every decision is logged with its engine, latency, and confidence"
          action={<Button size="sm" variant="ghost" onClick={() => go("agents")}>Details <ArrowRight size={13} /></Button>}>
          <ul className="divide-y max-h-[292px] overflow-y-auto">
            {ov.recentRuns.map((r: any) => (
              <li key={r.id} className="px-4 py-2 flex items-center gap-2.5">
                <Sparkles size={13} className="dim shrink-0" />
                <span className="mono text-[11.5px] font-medium w-[112px] shrink-0 truncate">{r.agent}</span>
                <span className="text-[12px] dim flex-1 truncate">{r.title ?? "—"}</span>
                {r.confidence != null && <Confidence value={r.confidence} />}
                <Badge className="shrink-0">{r.engine}</Badge>
                <span className="mono text-[11px] dim w-11 text-right shrink-0">{Math.round(r.ms)}ms</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* recent documents */}
      <Card title="Recently added"
        action={<Button size="sm" variant="ghost" onClick={() => go("documents")}>All documents <ArrowRight size={13} /></Button>}>
        {docs.length === 0 ? (
          <Empty title="Your vault is empty" hint="Drop a file anywhere on this page to add your first document." />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-px" style={{ background: "var(--border)" }}>
            {docs.slice(0, 6).map((d: any) => (
              <button key={d.id} onClick={() => openDoc(d.id)}
                className="text-left p-3.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text-dim)_5%,transparent)]"
                style={{ background: "var(--surface)" }}>
                <div className="flex items-start gap-2.5">
                  <CategoryIcon category={d.category} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium leading-snug line-clamp-1">{d.title}</div>
                    <div className="text-[11.5px] dim mt-0.5">
                      {d.category}{d.subcategory ? ` · ${d.subcategory}` : ""} · {relTime(d.created_at)}
                    </div>
                  </div>
                </div>
                <p className="text-[12px] dim mt-2 line-clamp-2 leading-relaxed">{d.summary}</p>
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                  <SensitivityBadge level={d.sensitivity} />
                  {d.expires_at && (
                    <Badge color={daysUntil(d.expires_at) < 45 ? "#b45309" : undefined}
                      bg={daysUntil(d.expires_at) < 45 ? "rgba(180,83,9,.12)" : undefined}>
                      <Clock size={10} /> {new Date(d.expires_at + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                    </Badge>
                  )}
                  {d.amount && <Badge>{fmtMoney(d.amount)}</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ ok, label, value }: { ok?: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="inline-flex items-center gap-2 dim">
        {ok ? (
          <CheckCircle2 size={14} style={{ color: "#059669" }} />
        ) : (
          <AlertTriangle size={14} style={{ color: "#b45309" }} />
        )}
        {label}
      </span>
      <span className="font-medium text-right" style={{ color: ok ? undefined : "#b45309" }}>{value}</span>
    </div>
  );
}
