/**
 * The sample documents are written with placeholder date tokens so the demo vault
 * always looks alive — renewals sit in the near future and statements in the recent
 * past, whatever day the app is run.
 *
 * Tokens:  {{+90d}}  {{-45d}}  {{+18m}}  {{-1y}}  and the long/short/iso variants.
 *   {{D+90}}   -> "November 11, 2026"   (long form)
 *   {{d+90}}   -> "2026-11-11"          (ISO)
 *   {{M-1}}    -> "July 2026"           (month + year)
 *   {{Y-1}}    -> "2025"                (year only)
 */

function shift(base: Date, spec: string): Date {
  const d = new Date(base);
  const m = spec.match(/^([+-]?\d+)([dmy])?$/);
  if (!m) return d;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "m": d.setMonth(d.getMonth() + n); break;
    case "y": d.setFullYear(d.getFullYear() + n); break;
    default: d.setDate(d.getDate() + n);
  }
  return d;
}

const LONG = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const ISO = (d: Date) => d.toISOString().slice(0, 10);
const MONTH = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** Replace every date token in a document template. */
export function resolveDates(text: string, now = new Date()): string {
  return text
    .replace(/\{\{D([+-]?\d+[dmy]?)\}\}/g, (_, s) => LONG(shift(now, s)))
    .replace(/\{\{d([+-]?\d+[dmy]?)\}\}/g, (_, s) => ISO(shift(now, s)))
    .replace(/\{\{M([+-]?\d+[dmy]?)\}\}/g, (_, s) => MONTH(shift(now, s)))
    .replace(/\{\{Y([+-]?\d+[dmy]?)\}\}/g, (_, s) => String(shift(now, s).getFullYear()));
}
