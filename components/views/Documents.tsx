"use client";

import { useMemo, useState } from "react";
import { Clock, LayoutGrid, List, Star, Filter } from "lucide-react";
import { Card, CategoryIcon, SensitivityBadge, Badge, Empty, Confidence, fmtMoney, fmtBytes, relTime, daysUntil, Button } from "../ui";

export default function Documents({ data, openDoc }: any) {
  const docs = data?.documents ?? [];
  const [cat, setCat] = useState<string | null>(null);
  const [sens, setSens] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("list");

  const cats = useMemo(() => [...new Set(docs.map((d: any) => d.category))] as string[], [docs]);

  const filtered = docs.filter((d: any) => {
    if (cat && d.category !== cat) return false;
    if (sens && d.sensitivity !== sens) return false;
    if (q) {
      const hay = `${d.title} ${d.summary} ${d.issuer} ${(d.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title, issuer, or tag…"
          className="rounded-lg px-3 py-1.5 text-[13px] w-64" />
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setCat(null)}
            className="text-[12px] px-2 py-1 rounded-md font-medium transition-colors"
            style={{ background: !cat ? "var(--accent-soft)" : "transparent", color: !cat ? "var(--accent)" : "var(--text-dim)" }}>
            All
          </button>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(cat === c ? null : c)}
              className="text-[12px] px-2 py-1 rounded-md font-medium transition-colors"
              style={{ background: cat === c ? "var(--accent-soft)" : "transparent", color: cat === c ? "var(--accent)" : "var(--text-dim)" }}>
              {c}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <select value={sens ?? ""} onChange={(e) => setSens(e.target.value || null)}
            className="rounded-lg px-2 py-1.5 text-[12.5px]">
            <option value="">Any sensitivity</option>
            <option value="restricted">Restricted</option>
            <option value="confidential">Confidential</option>
            <option value="internal">Internal</option>
            <option value="public">Public</option>
          </select>
          <Button size="sm" variant="ghost" onClick={() => setView(view === "grid" ? "list" : "grid")}>
            {view === "grid" ? <List size={14} /> : <LayoutGrid size={14} />}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><Empty title="No documents match" hint="Try clearing the filters, or drop a new file anywhere on the page." /></Card>
      ) : view === "list" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider dim border-b">
                  <th className="font-medium px-4 py-2.5">Document</th>
                  <th className="font-medium px-3 py-2.5 hidden md:table-cell">Issuer</th>
                  <th className="font-medium px-3 py-2.5">Sensitivity</th>
                  <th className="font-medium px-3 py-2.5 hidden lg:table-cell">Confidence</th>
                  <th className="font-medium px-3 py-2.5 hidden sm:table-cell text-right">Amount</th>
                  <th className="font-medium px-3 py-2.5">Expires</th>
                  <th className="font-medium px-4 py-2.5 text-right hidden xl:table-cell">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((d: any) => {
                  const dd = d.expires_at ? daysUntil(d.expires_at) : null;
                  return (
                    <tr key={d.id} onClick={() => openDoc(d.id)}
                      className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--text-dim)_5%,transparent)]">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CategoryIcon category={d.category} size={14} />
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[280px]">{d.title}</div>
                            <div className="text-[11.5px] dim">{d.category}{d.subcategory ? ` · ${d.subcategory}` : ""} · {fmtBytes(d.size)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 dim hidden md:table-cell truncate max-w-[160px]">{d.issuer ?? "—"}</td>
                      <td className="px-3 py-2.5"><SensitivityBadge level={d.sensitivity} /></td>
                      <td className="px-3 py-2.5 hidden lg:table-cell"><Confidence value={d.confidence} /></td>
                      <td className="px-3 py-2.5 text-right mono hidden sm:table-cell">{d.amount ? fmtMoney(d.amount) : "—"}</td>
                      <td className="px-3 py-2.5">
                        {d.expires_at ? (
                          <Badge color={dd! < 0 ? "#be123c" : dd! < 45 ? "#b45309" : undefined}
                            bg={dd! < 0 ? "rgba(190,18,60,.12)" : dd! < 45 ? "rgba(180,83,9,.12)" : undefined}>
                            <Clock size={10} />{dd! < 0 ? `${Math.abs(dd!)}d ago` : `${dd}d`}
                          </Badge>
                        ) : <span className="dim">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right dim text-[12px] hidden xl:table-cell">{relTime(d.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filtered.map((d: any) => (
            <button key={d.id} onClick={() => openDoc(d.id)} className="surface rounded-xl p-4 text-left transition-all hover:-translate-y-0.5">
              <div className="flex items-start gap-2.5">
                <CategoryIcon category={d.category} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium leading-snug line-clamp-2">{d.title}</div>
                  <div className="text-[11.5px] dim mt-0.5">{d.category}{d.subcategory ? ` · ${d.subcategory}` : ""}</div>
                </div>
              </div>
              <p className="text-[12px] dim mt-2.5 line-clamp-3 leading-relaxed">{d.summary}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <SensitivityBadge level={d.sensitivity} />
                {d.amount && <Badge>{fmtMoney(d.amount)}</Badge>}
                {(d.tags || []).slice(0, 2).map((t: string) => <Badge key={t}>#{t}</Badge>)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
