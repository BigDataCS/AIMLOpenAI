"use client";

import { ReactNode, useEffect, useState } from "react";
import {
  ShieldCheck, Lock, FileText, Landmark, Scale, IdCard, HeartPulse, Home, Briefcase,
  GraduationCap, Receipt, Car, Zap, FileQuestion, Percent,
} from "lucide-react";

export const CATEGORY_META: Record<string, { icon: any; color: string; bg: string }> = {
  Financial: { icon: Landmark, color: "#0e7490", bg: "rgba(14,116,144,.12)" },
  Legal: { icon: Scale, color: "#7c3aed", bg: "rgba(124,58,237,.12)" },
  Identity: { icon: IdCard, color: "#c2410c", bg: "rgba(194,65,12,.12)" },
  Insurance: { icon: ShieldCheck, color: "#0b6bcb", bg: "rgba(11,107,203,.12)" },
  Medical: { icon: HeartPulse, color: "#be123c", bg: "rgba(190,18,60,.12)" },
  Property: { icon: Home, color: "#047857", bg: "rgba(4,120,87,.12)" },
  Employment: { icon: Briefcase, color: "#4338ca", bg: "rgba(67,56,202,.12)" },
  Education: { icon: GraduationCap, color: "#a16207", bg: "rgba(161,98,7,.12)" },
  Tax: { icon: Percent, color: "#b45309", bg: "rgba(180,83,9,.12)" },
  Vehicle: { icon: Car, color: "#0f766e", bg: "rgba(15,118,110,.12)" },
  Utilities: { icon: Zap, color: "#ca8a04", bg: "rgba(202,138,4,.12)" },
  Receipts: { icon: Receipt, color: "#475569", bg: "rgba(71,85,105,.12)" },
  Unsorted: { icon: FileQuestion, color: "#64748b", bg: "rgba(100,116,139,.12)" },
};

export const SENSITIVITY_META: Record<string, { label: string; color: string; bg: string }> = {
  restricted: { label: "Restricted", color: "#be123c", bg: "rgba(190,18,60,.12)" },
  confidential: { label: "Confidential", color: "#b45309", bg: "rgba(180,83,9,.13)" },
  internal: { label: "Internal", color: "#0b6bcb", bg: "rgba(11,107,203,.12)" },
  public: { label: "Public", color: "#047857", bg: "rgba(4,120,87,.12)" },
};

export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.Unsorted;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg shrink-0"
      style={{ background: meta.bg, color: meta.color, width: size + 14, height: size + 14 }}
    >
      <Icon size={size} strokeWidth={2.1} />
    </span>
  );
}

export function Badge({
  children, color, bg, className = "", title,
}: { children: ReactNode; color?: string; bg?: string; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap ${className}`}
      style={{ color: color ?? "var(--text-dim)", background: bg ?? "color-mix(in srgb, var(--text-dim) 10%, transparent)" }}
    >
      {children}
    </span>
  );
}

export function SensitivityBadge({ level }: { level: string }) {
  const m = SENSITIVITY_META[level] ?? SENSITIVITY_META.internal;
  return (
    <Badge color={m.color} bg={m.bg} title={`Sensitivity tier: ${m.label}`}>
      <Lock size={10} /> {m.label}
    </Badge>
  );
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round((value ?? 0) * 100);
  const color = pct >= 85 ? "#047857" : pct >= 65 ? "#b45309" : "#be123c";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Model confidence ${pct}%`}>
      <span className="h-1.5 w-12 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--text-dim) 18%, transparent)" }}>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="mono text-[11px] dim">{pct}%</span>
    </span>
  );
}

export function Button({
  children, onClick, variant = "default", size = "md", disabled, type = "button", className = "", title,
}: {
  children: ReactNode; onClick?: () => void; variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md"; disabled?: boolean; type?: "button" | "submit"; className?: string; title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all active:scale-[.98] disabled:opacity-45 disabled:pointer-events-none";
  const sizes = { sm: "px-2.5 py-1.5 text-[12.5px]", md: "px-3.5 py-2 text-[13.5px]" };
  const variants: Record<string, string> = {
    primary: "text-white shadow-sm hover:brightness-110",
    default: "surface hover:border-[var(--accent)]",
    ghost: "hover:bg-[color-mix(in_srgb,var(--text-dim)_10%,transparent)]",
    danger: "text-white hover:brightness-110",
  };
  const style =
    variant === "primary" ? { background: "var(--accent)" } : variant === "danger" ? { background: "#be123c" } : undefined;
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={style}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "", title, subtitle, action }: {
  children: ReactNode; className?: string; title?: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <section className={`surface rounded-xl ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 border-b">
          <div className="min-w-0">
            {title && <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-[12px] dim mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, icon, tone }: {
  label: string; value: ReactNode; sub?: string; icon?: ReactNode; tone?: string;
}) {
  return (
    <div className="surface rounded-xl px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] uppercase tracking-wider dim font-medium">{label}</span>
        {icon}
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] dim mt-1.5">{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="dim opacity-50 mb-3">{icon ?? <FileText size={26} />}</div>
      <p className="text-[13.5px] font-medium">{title}</p>
      {hint && <p className="text-[12.5px] dim mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin shrink-0">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity=".22" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const fut = diff < 0;
  const m = Math.round(abs / 60000), h = Math.round(abs / 3600000), d = Math.round(abs / 864e5);
  if (abs < 45000) return "just now";
  if (m < 60) return fut ? `in ${m}m` : `${m}m ago`;
  if (h < 24) return fut ? `in ${h}h` : `${h}h ago`;
  if (d < 30) return fut ? `in ${d}d` : `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function daysUntil(date: string): number {
  return Math.ceil((new Date(date + "T00:00:00").getTime() - Date.now()) / 864e5);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Tiny markdown renderer for the plain-language explainers. */
export function Markdown({ text }: { text: string }) {
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="mono text-[12px] px-1 py-0.5 rounded" style="background:color-mix(in srgb,var(--text-dim) 12%,transparent)">$1</code>')
    .split(/\n\n+/)
    .map((p) => {
      if (/^[-*] /m.test(p)) {
        const items = p.split("\n").filter((l) => /^[-*] /.test(l)).map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`).join("");
        return `<ul class="list-disc pl-4 space-y-1">${items}</ul>`;
      }
      return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
  return <div className="space-y-2.5 text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("vm-theme");
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved ? saved === "dark" : prefers;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("vm-theme", next ? "dark" : "light");
      return next;
    });
  };
  return { dark, toggle };
}

export function Toast({ msg, tone = "ok" }: { msg: string; tone?: "ok" | "err" }) {
  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-lg animate-in"
      style={{
        background: tone === "err" ? "#be123c" : "var(--text)",
        color: tone === "err" ? "#fff" : "var(--bg)",
      }}
    >
      {msg}
    </div>
  );
}
