"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, Zap, Filter, CornerDownLeft } from "lucide-react";
import { Card, CategoryIcon, SensitivityBadge, Badge, Empty, Spinner, fmtMoney, daysUntil } from "../ui";

const EXAMPLES = [
  "car insurance deductible",
  "how much do I pay in rent",
  "documents expiring in 3 months",
  "tax refund last year",
  "restricted medical records",
  "receipts over $1000",
];

export default function SearchView({ openDoc }: any) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) {
      setRes(null);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((x) => x.json());
      if (r.ok) setRes(r);
      setBusy(false);
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  const p = res?.parsed;
  const chips = p
    ? [
        p.category && { k: "category", v: p.category },
        p.sensitivity && { k: "sensitivity", v: p.sensitivity },
        p.minAmount != null && { k: "amount", v: `> ${fmtMoney(p.minAmount)}` },
        p.maxAmount != null && { k: "amount", v: `< ${fmtMoney(p.maxAmount)}` },
        p.after && { k: "after", v: p.after },
        p.before && { k: "before", v: p.before },
        p.expiringDays && { k: "expiring", v: `next ${p.expiringDays} days` },
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 dim pointer-events-none" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything — try natural language, an amount, or a policy number…"
          className="w-full rounded-xl pl-11 pr-11 py-3 text-[14px]" />
        {busy && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 dim"><Spinner /></span>}
      </div>

      {!q && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setQ(e)}
                className="text-[12.5px] px-2.5 py-1.5 rounded-lg surface transition-colors hover:border-[var(--accent)]">
                {e}
              </button>
            ))}
          </div>
          <Card>
            <Empty icon={<Sparkles size={24} />} title="Hybrid retrieval, tuned for documents"
              hint="Keyword (BM25) and meaning-based (vector) results are fused with rank fusion, then filtered by any constraints found in your phrasing — dates, amounts, categories, or expiry windows." />
          </Card>
        </>
      )}

      {res && (
        <>
          <div className="flex items-center gap-2 flex-wrap text-[12px] dim">
            <span className="inline-flex items-center gap-1.5">
              <Zap size={13} /> {res.hits.length} result{res.hits.length !== 1 && "s"} in {res.timingMs.toFixed(1)}ms
            </span>
            {chips.length > 0 && (
              <>
                <span>·</span>
                <Filter size={12} />
                <span>auto-filters:</span>
                {chips.map((c: any, i: number) => (
                  <Badge key={i} color="var(--accent)" bg="var(--accent-soft)">{c.k}: {c.v}</Badge>
                ))}
              </>
            )}
          </div>

          {res.hits.length === 0 ? (
            <Card><Empty title="Nothing matched" hint="Try fewer words, or drop the filters implied by your phrasing." /></Card>
          ) : (
            <div className="space-y-2.5">
              {res.hits.map((h: any) => (
                <button key={h.docId} onClick={() => openDoc(h.docId)}
                  className="w-full text-left surface rounded-xl p-4 transition-all hover:-translate-y-0.5">
                  <div className="flex items-start gap-3">
                    <CategoryIcon category={h.category} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium">{h.title}</span>
                        <SensitivityBadge level={h.sensitivity} />
                        {h.amount && <Badge>{fmtMoney(h.amount)}</Badge>}
                        {h.expiresAt && (
                          <Badge color={daysUntil(h.expiresAt) < 45 ? "#b45309" : undefined}
                            bg={daysUntil(h.expiresAt) < 45 ? "rgba(180,83,9,.12)" : undefined}>
                            expires {h.expiresAt}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[12.5px] dim mt-1.5 leading-relaxed line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: h.snippet }} />
                      <div className="flex items-center gap-1.5 mt-2">
                        {h.matchedBy.map((m: string) => (
                          <Badge key={m} color="var(--accent)" bg="var(--accent-soft)">
                            {m === "keyword" ? "BM25" : m === "semantic" ? "vector" : "entity"}
                          </Badge>
                        ))}
                        <span className="mono text-[10.5px] dim ml-auto">rrf {h.score.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
