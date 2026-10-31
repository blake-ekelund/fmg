import type { QuerySpec } from "@/lib/assistant/dataCatalog";
import { addYmdDays, parseGroupKey, type Bucket } from "./dates";
import type { Widget } from "./types";

/* The time-period switcher on charts (business rule: every chart over time
   lets the viewer change the period). A choice rewrites the widget's query —
   the x-axis bucket and the date filters on that column, as relative dates —
   and the chart re-runs. Client-safe. */

export type RangeKey = "30d" | "3m" | "6m" | "12m" | "24m" | "ytd" | "last_year";
export type Period = { range: RangeKey; grain: Bucket };

export const RANGES: { key: RangeKey; label: string; months: number }[] = [
  { key: "30d", label: "Last 30 days", months: 1 },
  { key: "3m", label: "Last 3 months", months: 3 },
  { key: "6m", label: "Last 6 months", months: 6 },
  { key: "12m", label: "Last 12 months", months: 12 },
  { key: "24m", label: "Last 24 months", months: 24 },
  { key: "ytd", label: "Year to date", months: 12 },
  { key: "last_year", label: "Last year", months: 12 },
];

export const GRAIN_LABEL: Record<Bucket, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year" };

/* Columns that only hold month starts — they can't be shown by day or week. */
const MONTHLY_ONLY = new Set(["sales_by_product_month.month"]);

/** The chart's time axis, or null when the x-axis isn't a date bucket. */
export function timeAxis(w: Widget): { column: string; bucket: Bucket } | null {
  if (w.type !== "chart") return null;
  const g = parseGroupKey(w.query.group_by?.[0] ?? "");
  return g.bucket ? { column: g.column, bucket: g.bucket } : null;
}

/** Grains that make sense for a range on this chart's column. */
export function grainsFor(w: Widget, range: RangeKey): Bucket[] {
  const axis = timeAxis(w);
  if (!axis) return [];
  const months = RANGES.find((r) => r.key === range)!.months;
  const monthly = MONTHLY_ONLY.has(`${w.query.dataset}.${axis.column}`);
  const out: Bucket[] = [];
  if (!monthly && months <= 3) out.push("day");
  if (!monthly && months <= 12) out.push("week");
  if (months >= 3 || monthly) out.push("month");
  if (months >= 6) out.push("quarter");
  if (months >= 24 || range === "last_year" || range === "ytd") out.push("year");
  return out;
}

/** Best default grain for a range. */
export function defaultGrain(w: Widget, range: RangeKey): Bucket {
  const allowed = grainsFor(w, range);
  const months = RANGES.find((r) => r.key === range)!.months;
  const want: Bucket = months <= 1 ? "day" : months <= 3 ? "week" : "month";
  return allowed.includes(want) ? want : allowed.includes("month") ? "month" : allowed[0] ?? "month";
}

/** Relative-date start (and optional end) for a range, aligned to the grain. */
function bounds(range: RangeKey, grain: Bucket): { from: string; to?: string } {
  if (range === "ytd") return { from: "@start_of_year" };
  if (range === "last_year") return { from: "@start_of_year-1y", to: "@start_of_year" };
  const months = RANGES.find((r) => r.key === range)!.months;
  if (range === "30d") return { from: grain === "week" ? "@start_of_week-4w" : "@today-29d" };
  switch (grain) {
    case "day": return { from: `@today-${Math.round(months * 30.4) - 1}d` };
    case "week": return { from: `@start_of_week-${Math.round(months * 4.345) - 1}w` };
    case "quarter": return { from: `@start_of_quarter-${Math.ceil(months / 3) * 3 - 3}m` };
    case "year": return { from: `@start_of_year-${Math.ceil(months / 12) - 1}y` };
    default: return { from: `@start_of_month-${months - 1}m` };
  }
}

/** The widget re-pointed at a period. */
export function applyPeriod(w: Widget, p: Period): Widget {
  const axis = timeAxis(w);
  if (!axis) return w;
  const { from, to } = bounds(p.range, p.grain);
  const keep = (w.query.filters ?? []).filter((f) => !(f.column === axis.column && ["gt", "gte", "lt", "lte", "eq"].includes(f.op)));
  const filters: QuerySpec["filters"] = [...keep, { column: axis.column, op: "gte", value: from }, ...(to ? [{ column: axis.column, op: "lt" as const, value: to }] : [])];
  const group_by = [`${axis.column}:${p.grain}`, ...(w.query.group_by ?? []).slice(1)];
  return { ...w, query: { ...w.query, filters, group_by } };
}

/** First day after the period that starts on `start` (YYYY-MM-DD) — for drilling into one bar. */
export function periodEnd(start: string, grain: Bucket): string {
  const y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7)), d = Number(start.slice(8, 10));
  const fmt = (t: Date) => t.toISOString().slice(0, 10);
  switch (grain) {
    case "day": { const n = addYmdDays({ y, m, d }, 1); return `${n.y}-${String(n.m).padStart(2, "0")}-${String(n.d).padStart(2, "0")}`; }
    case "week": { const n = addYmdDays({ y, m, d }, 7); return `${n.y}-${String(n.m).padStart(2, "0")}-${String(n.d).padStart(2, "0")}`; }
    case "month": return fmt(new Date(Date.UTC(y, m, 1)));
    case "quarter": return fmt(new Date(Date.UTC(y, m + 2, 1)));
    case "year": return `${y + 1}-01-01`;
  }
}
