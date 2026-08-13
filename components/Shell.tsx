"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck, LayoutDashboard, Search, MessageSquareText, Bell, Share2, FileStack,
  Sparkles, FileCog, ClipboardType, ScrollText, Lock, Moon, Sun, Upload, Cpu,
} from "lucide-react";
import { Button, Spinner, Toast, useTheme } from "./ui";
import Dashboard from "./views/Dashboard";
import Documents from "./views/Documents";
import SearchView from "./views/SearchView";
import Assistant from "./views/Assistant";
import Reminders from "./views/Reminders";
import Sharing from "./views/Sharing";
import Convert from "./views/Convert";
import Autofill from "./views/Autofill";
import Security from "./views/Security";
import Agents from "./views/Agents";
import UploadZone from "./UploadZone";
import DocumentDrawer from "./DocumentDrawer";

export type Nav =
  | "dashboard" | "documents" | "search" | "assistant" | "reminders"
  | "sharing" | "convert" | "autofill" | "agents" | "security";

const NAV: { id: Nav; label: string; icon: any; group: string }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, group: "Vault" },
  { id: "documents", label: "Documents", icon: FileStack, group: "Vault" },
  { id: "search", label: "Search", icon: Search, group: "Find" },
  { id: "assistant", label: "Ask your vault", icon: MessageSquareText, group: "Find" },
  { id: "reminders", label: "Renewals", icon: Bell, group: "Act" },
  { id: "autofill", label: "Form autofill", icon: ClipboardType, group: "Act" },
  { id: "convert", label: "Convert", icon: FileCog, group: "Act" },
  { id: "sharing", label: "Secure sharing", icon: Share2, group: "Act" },
  { id: "agents", label: "Agent activity", icon: Cpu, group: "Trust" },
  { id: "security", label: "Security & backup", icon: ScrollText, group: "Trust" },
];

export default function Shell({ engine, onLock }: { engine: { name: string; label: string }; onLock: () => void }) {
  const [nav, setNav] = useState<Nav>("dashboard");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone?: "ok" | "err" } | null>(null);
  const [seed, setSeed] = useState(0);
  const { dark, toggle } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.status === 401) return onLock();
    const d = await res.json();
    if (d.ok) setData(d);
    setLoading(false);
  }, [onLock]);

  useEffect(() => {
    refresh();
  }, [refresh, seed]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setUploading(true);
      const fd = new FormData();
      list.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      setUploading(false);
      if (!d.ok) {
        notify(d.error || "Upload failed", "err");
        if (d.locked) onLock();
        return;
      }
      const dupes = d.results.filter((r: any) => r.duplicate).length;
      const ocr = d.results.filter((r: any) => r.status === "needs-ocr").length;
      const added = d.results.length - dupes;
      notify(
        [added ? `${added} document${added > 1 ? "s" : ""} secured & analysed` : null,
         dupes ? `${dupes} duplicate skipped` : null,
         ocr ? `${ocr} need OCR` : null].filter(Boolean).join(" · ") || "Done"
      );
      setSeed((s) => s + 1);
    },
    [notify, onLock]
  );

  const lockNow = async () => {
    await fetch("/api/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" }),
    });
    onLock();
  };

  const ov = data?.overview;
  const shared = { data, refresh: () => setSeed((s) => s + 1), notify, openDoc: setOpenDoc };

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="min-h-screen flex" onDragOver={(e) => e.preventDefault()}>
      {/* sidebar */}
      <aside className="w-[228px] shrink-0 border-r flex flex-col sticky top-0 h-screen" style={{ background: "var(--surface)" }}>
        <div className="px-4 h-14 flex items-center gap-2.5 border-b shrink-0">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#38bdf8,#0284c7)" }}>
            <ShieldCheck size={17} strokeWidth={2.3} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-tight leading-tight">VaultMind</div>
            <div className="text-[10.5px] dim leading-tight truncate">{engine.label}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2 mb-1 text-[10.5px] font-semibold uppercase tracking-wider dim opacity-70">{g}</div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g).map((n) => {
                  const active = nav === n.id;
                  const badge =
                    n.id === "reminders" ? (ov?.overdue?.length ?? 0) + (ov?.expiring30 ?? 0) :
                    n.id === "documents" ? ov?.documents : 0;
                  return (
                    <button key={n.id} onClick={() => setNav(n.id)}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-medium transition-colors"
                      style={{
                        background: active ? "var(--accent-soft)" : undefined,
                        color: active ? "var(--accent)" : "var(--text-dim)",
                      }}>
                      <n.icon size={15.5} strokeWidth={2.1} className="shrink-0" />
                      <span className="truncate flex-1 text-left">{n.label}</span>
                      {!!badge && (
                        <span className="mono text-[10.5px] px-1.5 py-px rounded-full shrink-0"
                          style={{
                            background: n.id === "reminders" && (ov?.overdue?.length ?? 0) > 0 ? "rgba(190,18,60,.15)" : "color-mix(in srgb,var(--text-dim) 14%,transparent)",
                            color: n.id === "reminders" && (ov?.overdue?.length ?? 0) > 0 ? "#be123c" : "var(--text-dim)",
                          }}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-2.5 border-t space-y-1.5 shrink-0">
          <Button size="sm" variant="primary" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <Upload size={14} />}
            {uploading ? "Analysing…" : "Add documents"}
          </Button>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="flex-1" onClick={toggle} title="Toggle theme">
              {dark ? <Sun size={14} /> : <Moon size={14} />}
              {dark ? "Light" : "Dark"}
            </Button>
            <Button size="sm" variant="ghost" className="flex-1" onClick={lockNow} title="Lock the vault now">
              <Lock size={14} /> Lock
            </Button>
          </div>
        </div>
      </aside>

      {/* main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b flex items-center justify-between px-6 sticky top-0 z-20 backdrop-blur"
          style={{ background: "color-mix(in srgb, var(--bg) 86%, transparent)" }}>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">{NAV.find((n) => n.id === nav)?.label}</h1>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] dim">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full pulse-ring" style={{ background: "#10b981" }} />
              Unlocked
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline mono">{ov?.documents ?? 0} docs encrypted</span>
          </div>
        </header>

        <div className="flex-1 p-6 max-w-[1400px] w-full">
          {loading ? (
            <div className="flex items-center gap-2 dim text-[13px] py-20 justify-center">
              <Spinner /> Opening vault…
            </div>
          ) : (
            <div key={nav} className="animate-in">
              {nav === "dashboard" && <Dashboard {...shared} go={setNav} />}
              {nav === "documents" && <Documents {...shared} />}
              {nav === "search" && <SearchView {...shared} />}
              {nav === "assistant" && <Assistant {...shared} />}
              {nav === "reminders" && <Reminders {...shared} />}
              {nav === "sharing" && <Sharing {...shared} />}
              {nav === "convert" && <Convert {...shared} />}
              {nav === "autofill" && <Autofill {...shared} />}
              {nav === "agents" && <Agents {...shared} />}
              {nav === "security" && <Security {...shared} onLock={onLock} />}
            </div>
          )}
        </div>
      </main>

      <input ref={fileRef} type="file" multiple hidden
        onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />

      <UploadZone onDrop={upload} busy={uploading} />

      {openDoc && (
        <DocumentDrawer
          id={openDoc}
          onClose={() => setOpenDoc(null)}
          onChanged={() => setSeed((s) => s + 1)}
          notify={notify}
        />
      )}

      {toast && <Toast msg={toast.msg} tone={toast.tone} />}
    </div>
  );
}
