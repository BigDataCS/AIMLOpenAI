import { resolveShare, recordShareView, redactText } from "@/lib/vault";
import { db } from "@/lib/db";
import { ShieldCheck, Lock, Eye, Clock, EyeOff, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const REASONS: Record<string, { title: string; body: string }> = {
  "not-found": { title: "This link doesn't exist", body: "The link may have been mistyped, or it was revoked and purged." },
  revoked: { title: "This link was revoked", body: "The owner cancelled access. Ask them for a new link." },
  expired: { title: "This link has expired", body: "Secure links carry a fixed lifetime and this one has passed it." },
  exhausted: { title: "View limit reached", body: "This link allowed a limited number of views and they have all been used." },
};

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { token } = await params;
  const { p } = await searchParams;

  const result = resolveShare(token, p);

  if (!result.ok && result.reason === "password") {
    return (
      <Frame>
        <div className="text-center">
          <Lock size={26} className="mx-auto mb-3" style={{ color: "var(--accent)" }} />
          <h1 className="text-[17px] font-semibold tracking-tight">This document is password protected</h1>
          <p className="text-[13px] dim mt-1.5">Enter the password the sender gave you.</p>
          <form className="mt-5 flex gap-2 justify-center" method="get">
            <input name="p" type="password" placeholder="Password" autoFocus
              className="rounded-lg px-3 py-2 text-[13.5px] w-56" />
            <button type="submit" className="rounded-lg px-4 py-2 text-[13.5px] font-medium text-white"
              style={{ background: "var(--accent)" }}>
              Unlock
            </button>
          </form>
          {p !== undefined && (
            <p className="text-[12.5px] mt-3" style={{ color: "#be123c" }}>That password was not correct.</p>
          )}
        </div>
      </Frame>
    );
  }

  if (!result.ok) {
    const r = REASONS[result.reason] ?? REASONS["not-found"];
    return (
      <Frame>
        <div className="text-center">
          <AlertTriangle size={26} className="mx-auto mb-3" style={{ color: "#b45309" }} />
          <h1 className="text-[17px] font-semibold tracking-tight">{r.title}</h1>
          <p className="text-[13px] dim mt-1.5 max-w-sm mx-auto leading-relaxed">{r.body}</p>
        </div>
      </Frame>
    );
  }

  const { share, doc } = result;
  recordShareView(share.id, doc.id);

  const row = db().prepare("SELECT body FROM doc_text WHERE doc_id = ?").get(doc.id) as any;
  const raw: string = row?.body ?? "";
  const text = share.redact ? redactText(raw) : raw;
  const summary = share.redact ? redactText(doc.summary ?? "") : doc.summary ?? "";
  const remaining = share.max_views - share.views - 1;

  return (
    <Frame wide>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11.5px] dim">
            <ShieldCheck size={13} style={{ color: "var(--accent)" }} />
            Shared securely via VaultMind
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight mt-1.5">{doc.title}</h1>
          <div className="text-[12.5px] dim mt-1">
            {doc.category}{doc.subcategory ? ` · ${doc.subcategory}` : ""}
            {doc.issuer ? ` · ${doc.issuer}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-[11.5px] dim">
          <span className="inline-flex items-center gap-1.5">
            <Eye size={12} /> {remaining} {remaining === 1 ? "view" : "views"} remaining
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} /> expires {new Date(share.expires_at).toLocaleString()}
          </span>
          {!!share.redact && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <EyeOff size={11} /> identifiers redacted
            </span>
          )}
        </div>
      </div>

      {summary && (
        <div className="mt-5 rounded-xl p-4 surface-2">
          <div className="text-[11.5px] uppercase tracking-wider dim font-medium mb-1.5">Summary</div>
          <p className="text-[13px] leading-relaxed">{summary}</p>
        </div>
      )}

      <div className="mt-4 rounded-xl surface overflow-hidden">
        <div className="px-4 py-2.5 border-b text-[11.5px] uppercase tracking-wider dim font-medium">Document</div>
        <pre className="px-4 py-4 text-[12.5px] mono whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
          {text || "This document has no readable text layer."}
        </pre>
      </div>

      <p className="mt-4 text-[11.5px] dim leading-relaxed">
        This view was recorded in the owner's tamper-evident audit log. The link can be revoked at any time,
        and it stops working the moment its expiry or view limit is reached.
      </p>
    </Frame>
  );
}

function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} surface rounded-2xl p-6 sm:p-8`}>{children}</div>
    </div>
  );
}
