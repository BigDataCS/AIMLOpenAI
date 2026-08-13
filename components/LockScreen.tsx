"use client";

import { useState } from "react";
import { ShieldCheck, KeyRound, Sparkles, Search, Bell, Share2, FileStack, Lock } from "lucide-react";
import { Button, Spinner } from "./ui";

const FEATURES = [
  { icon: Search, title: "Ask, don't dig", text: "Natural-language search across every document, with grounded answers and citations." },
  { icon: Sparkles, title: "Understand anything", text: "Dense contracts rewritten in plain English, with jargon decoded and risks surfaced." },
  { icon: FileStack, title: "Files itself", text: "Agents classify, tag, and index each upload the moment it lands." },
  { icon: Bell, title: "Never miss a renewal", text: "Expiry dates are detected automatically and tracked before they bite." },
  { icon: Share2, title: "Share without leaking", text: "Expiring, view-capped, password-protected links with automatic redaction." },
  { icon: Lock, title: "Encrypted end to end", text: "AES-256-GCM envelope encryption. The key is derived from your passphrase alone." },
];

export default function LockScreen({
  exists,
  onUnlocked,
}: {
  exists: boolean;
  onUnlocked: () => void;
}) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!pass) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: exists ? "unlock" : "init", passphrase: pass }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setErr(data.error || "Could not unlock the vault.");
      return;
    }
    onUnlocked();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_.95fr]">
      {/* left: pitch */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 overflow-hidden"
        style={{ background: "linear-gradient(155deg,#0a1020 0%,#111a2e 45%,#0e2038 100%)" }}>
        <div className="absolute -top-32 -right-24 w-[26rem] h-[26rem] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle,#38bdf8,transparent 70%)" }} />
        <div className="absolute bottom-0 -left-20 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle,#818cf8,transparent 70%)" }} />

        <div className="relative">
          <div className="flex items-center gap-2.5 text-white">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: "linear-gradient(135deg,#38bdf8,#0284c7)" }}>
              <ShieldCheck size={19} strokeWidth={2.3} />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">VaultMind</span>
          </div>

          <h1 className="mt-12 text-[34px] xl:text-[42px] font-semibold leading-[1.1] tracking-tight text-white max-w-lg">
            Every document you own,
            <span style={{ color: "#7dd3fc" }}> understood</span> and
            <span style={{ color: "#7dd3fc" }}> protected</span>.
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed max-w-md" style={{ color: "#9fb3d1" }}>
            A private, encrypted vault where a mesh of AI agents reads, files, explains, and
            guards your paperwork — so you stop hunting for it and never miss a deadline.
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-x-6 gap-y-5 max-w-xl">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <f.icon size={17} className="mt-0.5 shrink-0" style={{ color: "#7dd3fc" }} />
                <div>
                  <div className="text-[13px] font-medium text-white">{f.title}</div>
                  <div className="text-[12.5px] leading-relaxed mt-0.5" style={{ color: "#8ba1c2" }}>{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-4 text-[11.5px]" style={{ color: "#6d84a8" }}>
          <span className="mono">AES-256-GCM</span>
          <span>·</span>
          <span className="mono">scrypt KDF</span>
          <span>·</span>
          <span className="mono">Hash-chained audit log</span>
          <span>·</span>
          <span className="mono">Zero third-party upload</span>
        </div>
      </div>

      {/* right: unlock */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white"
              style={{ background: "linear-gradient(135deg,#38bdf8,#0284c7)" }}>
              <ShieldCheck size={19} strokeWidth={2.3} />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">VaultMind</span>
          </div>

          <h2 className="text-[22px] font-semibold tracking-tight">
            {exists ? "Unlock your vault" : "Create your vault"}
          </h2>
          <p className="text-[13px] dim mt-1.5 leading-relaxed">
            {exists
              ? "Your passphrase derives the key that decrypts every document. It is never stored."
              : "Choose a master passphrase. It derives your encryption key and cannot be recovered — there is no backdoor."}
          </p>

          <div className="mt-6 space-y-3">
            <label className="block">
              <span className="text-[12px] font-medium dim">Master passphrase</span>
              <div className="mt-1.5 relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 dim pointer-events-none" />
                <input
                  autoFocus
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder={exists ? "Enter passphrase" : "At least 8 characters"}
                  className="w-full rounded-lg pl-9 pr-3 py-2.5 text-[13.5px]"
                />
              </div>
            </label>

            {err && (
              <div className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: "rgba(190,18,60,.1)", color: "#be123c" }}>
                {err}
              </div>
            )}

            <Button variant="primary" onClick={submit} disabled={busy || pass.length < (exists ? 1 : 8)} className="w-full">
              {busy ? <Spinner /> : <ShieldCheck size={15} />}
              {busy ? "Deriving key…" : exists ? "Unlock vault" : "Create vault"}
            </Button>
          </div>

          {exists && (
            <div className="mt-5 rounded-lg px-3.5 py-3 text-[12.5px] surface-2">
              <div className="font-medium mb-1">Demo vault</div>
              <p className="dim leading-relaxed">
                Ten realistic documents are pre-loaded. Passphrase:{" "}
                <code className="mono px-1 py-0.5 rounded" style={{ background: "color-mix(in srgb,var(--text-dim) 14%,transparent)" }}>
                  demo-passphrase
                </code>
              </p>
            </div>
          )}

          <p className="mt-6 text-[11.5px] dim leading-relaxed">
            Documents are encrypted at rest with a per-file key. The vault auto-locks after 30 minutes
            of inactivity, and every action is written to a tamper-evident audit chain.
          </p>
        </div>
      </div>
    </div>
  );
}
