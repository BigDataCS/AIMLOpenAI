"use client";

import { useRef, useState } from "react";
import { Send, Sparkles, FileText, ShieldCheck, CornerDownLeft } from "lucide-react";
import { Card, Empty, Spinner, Badge, Markdown, Button } from "../ui";

type Msg = { role: "user" | "assistant"; text: string; citations?: any[]; engine?: string; ms?: number };

const SUGGESTIONS = [
  "How much is my auto insurance premium?",
  "When does my passport expire?",
  "What is my monthly rent and when is it due?",
  "What was my tax refund last year?",
  "What notice must I give to terminate my consulting agreement?",
  "Which of my documents contain medical information?",
];

export default function Assistant({ openDoc }: any) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    const r = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }).then((x) => x.json());

    setMsgs((m) => [
      ...m,
      r.ok
        ? { role: "assistant", text: r.answer, citations: r.citations, engine: r.engine, ms: r.ms }
        : { role: "assistant", text: r.error || "Something went wrong." },
    ]);
    setBusy(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  return (
    <div className="max-w-3xl space-y-4">
      {msgs.length === 0 ? (
        <>
          <Card>
            <Empty icon={<Sparkles size={24} />} title="Ask anything about your documents"
              hint="Answers are grounded in your own files and cited back to the source. Nothing is invented — if the answer isn't in your vault, it says so." />
          </Card>
          <div className="grid sm:grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}
                className="text-left text-[12.5px] px-3 py-2.5 rounded-lg surface transition-colors hover:border-[var(--accent)]">
                {s}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3.5">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <div className="rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13.5px] max-w-[80%] text-white animate-in"
                  style={{ background: "var(--accent)" }}>
                  {m.text}
                </div>
              ) : (
                <div className="surface rounded-2xl rounded-bl-md px-4 py-3.5 animate-in">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={13} className="accent" />
                    <span className="text-[11.5px] font-medium dim">Grounded answer</span>
                    {m.engine && <Badge>{m.engine === "openai" ? "OpenAI" : "local NLP"}</Badge>}
                    {m.ms != null && <span className="mono text-[10.5px] dim">{m.ms.toFixed(0)}ms</span>}
                  </div>
                  <Markdown text={m.text} />
                  {!!m.citations?.length && (
                    <div className="mt-3 pt-2.5 border-t flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11.5px] dim">Sources:</span>
                      {m.citations.map((c: any) => (
                        <button key={c.docId} onClick={() => openDoc(c.docId)}
                          className="inline-flex items-center gap-1 text-[11.5px] px-2 py-0.5 rounded-md font-medium transition-colors"
                          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                          <FileText size={10.5} /> {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="surface rounded-2xl rounded-bl-md px-4 py-3.5 inline-flex items-center gap-2 text-[13px] dim animate-in">
              <Spinner /> Retrieving from your vault…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <div className="sticky bottom-0 pt-2" style={{ background: "linear-gradient(transparent, var(--bg) 30%)" }}>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)}
            placeholder="Ask about any document in your vault…"
            className="w-full rounded-xl pl-4 pr-12 py-3 text-[13.5px]" />
          <button onClick={() => ask(q)} disabled={busy || !q.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg inline-flex items-center justify-center text-white disabled:opacity-40 transition-all active:scale-95"
            style={{ background: "var(--accent)" }}>
            <Send size={14} />
          </button>
        </div>
        <p className="text-[11px] dim mt-1.5 flex items-center gap-1.5">
          <ShieldCheck size={11} /> Retrieval runs locally against your encrypted index.
        </p>
      </div>
    </div>
  );
}
