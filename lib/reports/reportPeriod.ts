import type { QuerySpec } from "@/lib/assistant/dataCatalog";
import { fmtYmd, parseGroupKey, zonedYmd, type Bucket } from "./dates";
import type { Widget } from "./types";

/**
 * The report's period — ONE setting that feeds every widget (business rule:
 * a report reads one period, set in one place at the top). It replaces each
 * widget's own date filters on its dataset's date column, sets the chart
 * grain from the period's length, and builds every KPI's comparison.
 *
 * Client-safe: the page uses it for the picker and labels; the server
 * (lib/reports/run.ts runReportForPeriod) applies it to the queries.
 */

export const PERIOD_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "wtd", label: "Week to date" },
  { key: "last_week", label: "Last week" },
  { key: "mtd", label: "Month to date" },
  { key: "last_month", label: "Last month" },
  { key: "qtd", label: "Quarter to date" },
  { key: "last_quarter", label: "Last quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "last_year", label: "Last year" },
  { key: "last_7", label: "Last 7 days" },
  { key: "last_30", label: "Last 30 days" },
  { key: "last_90", label: "Last 90 days" },
  { key: "last_12m", label: "Last 12 full months" },
  { key: "custom", label: "Custom dates" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];

export const COMPARE_MODES = [
  { key: "last_year", label: "Same period last year" },
  { key: "prior", label: "Previous period" },
  { key: "none", label: "No comparison" },
] as const;
export type CompareMode = (typeof COMPARE_MODES)[number]["key"];

/** Saved on the report. Custom `from` / `to` are inclusive YYYY-MM-DD. */
export type ReportPeriod = { preset: PeriodPreset; from?: string; to?: string; compare: CompareMode };

/** `from` inclusive, `to` exclusive (YYYY-MM-DD). */
export type DateRange = { from: string; to: string };

export type ResolvedPeriod = {
  period: ReportPeriod;
  range: DateRange;
  compare: DateRange | null;
  label: string;
  compareLabel: string | null;
  /** The chart grain the period's length calls for. */
  grain: Bucket;
};

export const DEFAULT_PERIOD: ReportPeriod = { preset: "mtd", compare: "last_year" };

/* ── Date arithmetic on YYYY-MM-DD (UTC math, no DST) ─────────────────── */

const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 86_400_000));
function addMonths(s: string, n: number): string {
  const d = parse(s);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d.getUTCDate(), last))));
}
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
const startOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
const startOfQuarter = (s: string) => `${s.slice(0, 4)}-${String(Math.floor((Number(s.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
const startOfYear = (s: string) => `${s.slice(0, 4)}-01-01`;
function startOfWeek(s: string): string {
  const dow = parse(s).getUTCDay(); // 0 = Sunday; weeks start Monday
  return addDays(s, -((dow + 6) % 7));
}
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* ── Resolve ───────────────────────────────────────────────────────────── */

function rangeFor(p: ReportPeriod, today: string): DateRange {
  const tomorrow = addDays(today, 1);
  switch (p.preset) {
    case "today": return { from: today, to: tomorrow };
    case "yesterday": return { from: addDays(today, -1), to: today };
    case "wtd": return { from: startOfWeek(today), to: tomorrow };
    case "last_week": { const w = startOfWeek(today); return { from: addDays(w, -7), to: w }; }
    case "mtd": return { from: startOfMonth(today), to: tomorrow };
    case "last_month": { const m = startOfMonth(today); return { from: addMonths(m, -1), to: m }; }
    case "qtd": return { from: startOfQuarter(today), to: tomorrow };
    case "last_quarter": { const q = startOfQuarter(today); return { from: addMonths(q, -3), to: q }; }
    case "ytd": return { from: startOfYear(today), to: tomorrow };
    case "last_year": { const y = startOfYear(today); return { from: addMonths(y, -12), to: y }; }
    case "last_7": return { from: addDays(today, -6), to: tomorrow };
    case "last_30": return { from: addDays(today, -29), to: tomorrow };
    case "last_90": return { from: addDays(today, -89), to: tomorrow };
    case "last_12m": { const m = startOfMonth(today); return { from: addMonths(m, -12), to: m }; }
    case "custom": {
      const from = isDate(p.from) ? p.from : today;
      const to = isDate(p.to) && p.to >= from ? p.to : from;
      return { from, to: addDays(to, 1) };
    }
  }
}

/** The comparison: the same dates a year earlier, or the period just before. */
function compareFor(p: ReportPeriod, r: DateRange): DateRange | null {
  if (p.compare === "none") return null;
  if (p.compare === "last_year") return { from: addMonths(r.from, -12), to: addMonths(r.to, -12) };
  const days = daysBetween(r.from, r.to);
  switch (p.preset) {
    // Whole calendar periods → the previous one.
    case "last_month": return { from: addMonths(r.from, -1), to: r.from };
    case "last_quarter": return { from: addMonths(r.from, -3), to: r.from };
    case "last_year": return { from: addMonths(r.from, -12), to: r.from };
    case "last_12m": return { from: addMonths(r.from, -12), to: r.from };
    case "last_week": return { from: addDays(r.from, -7), to: r.from };
    // To-date periods → the same number of days at the start of the previous one.
    case "mtd": { const f = addMonths(r.from, -1); return { from: f, to: addDays(f, days) }; }
    case "qtd": { const f = addMonths(r.from, -3); return { from: f, to: addDays(f, days) }; }
    case "ytd": { const f = addMonths(r.from, -12); return { from: f, to: addDays(f, days) }; }
    case "wtd": return { from: addDays(r.from, -7), to: addDays(r.from, -7 + days) };
    // Rolling / custom → the same length immediately before.
    default: return { from: addDays(r.from, -days), to: r.from };
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`;

/** "Nov 2, 2026", "Nov 1–2, 2026", "Oct 3 – Nov 2, 2026", "Dec 1, 2025 – Nov 2, 2026". */
export function rangeLabel(r: DateRange): string {
  const last = addDays(r.to, -1);
  const [fy, ly] = [r.from.slice(0, 4), last.slice(0, 4)];
  if (r.from === last) return `${md(r.from)}, ${fy}`;
  if (r.from.slice(0, 7) === last.slice(0, 7)) return `${md(r.from)}–${Number(last.slice(8, 10))}, ${fy}`;
  if (fy === ly) return `${md(r.from)} – ${md(last)}, ${fy}`;
  return `${md(r.from)}, ${fy} – ${md(last)}, ${ly}`;
}

function grainFor(r: DateRange): Bucket {
  const days = daysBetween(r.from, r.to);
  return days <= 45 ? "day" : days <= 190 ? "week" : "month";
}

export function normalizePeriod(raw: unknown): ReportPeriod {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const preset = PERIOD_PRESETS.some((x) => x.key === p.preset) ? (p.preset as PeriodPreset) : DEFAULT_PERIOD.preset;
  const compare = COMPARE_MODES.some((x) => x.key === p.compare) ? (p.compare as CompareMode) : DEFAULT_PERIOD.compare;
  const out: ReportPeriod = { preset, compare };
  if (preset === "custom") {
    out.from = isDate(p.from) ? p.from : undefined;
    out.to = isDate(p.to) ? p.to : out.from;
  }
  return out;
}

export function resolvePeriod(raw: unknown, now = new Date()): ResolvedPeriod {
  const period = normalizePeriod(raw);
  const today = fmtYmd(zonedYmd(now));
  const range = rangeFor(period, today);
  const compare = compareFor(period, range);
  return {
    period,
    range,
    compare,
    label: rangeLabel(range),
    compareLabel: compare ? rangeLabel(compare) : null,
    grain: grainFor(range),
  };
}

/* ── Apply to widgets ──────────────────────────────────────────────────── */

const MONTHLY = "sales_by_product_month";
const DAILY = "sales_by_product_day";
const monthAligned = (r: DateRange) => r.from.endsWith("-01") && r.to.endsWith("-01");
/** A range widened to whole months (when only the monthly view is available). */
export const widenToMonths = (r: DateRange): DateRange => ({
  from: startOfMonth(r.from),
  to: r.to.endsWith("-01") ? r.to : addMonths(startOfMonth(r.to), 1),
});

type Apply = {
  dateColumnOf: (dataset: string) => string | null;
  /** False when the daily sales view isn't in the database yet. */
  dailyAvailable: boolean;
};

const DATE_OPS = new Set(["gt", "gte", "lt", "lte", "eq"]);

function retarget(q: QuerySpec, range: DateRange, grain: Bucket, opts: Apply): QuerySpec | null {
  let dataset = q.dataset;
  // Monthly sales can't answer part of a month or a daily/weekly trend — read the daily view.
  if (dataset === MONTHLY && opts.dailyAvailable && (!monthAligned(range) || grain === "day" || grain === "week")) dataset = DAILY;
  const col = opts.dateColumnOf(dataset);
  if (!col) return null;
  const r = dataset === MONTHLY ? widenToMonths(range) : range;
  const oldCol = opts.dateColumnOf(q.dataset);
  const filters = (q.filters ?? []).filter((f) => !((f.column === col || f.column === oldCol) && DATE_OPS.has(f.op)));
  filters.push({ column: col, op: "gte", value: r.from }, { column: col, op: "lt", value: r.to });
  const g = dataset === MONTHLY ? "month" : grain;
  const group_by = q.group_by?.map((key) => {
    const { column, bucket } = parseGroupKey(key);
    const isDateCol = column === col || column === oldCol || (dataset === DAILY && column === "month");
    return isDateCol || bucket ? (isDateCol ? `${col}:${g}` : `${column}:${g}`) : key;
  });
  return { ...q, dataset, filters, ...(group_by ? { group_by } : {}) };
}

/** The widget as it runs for the period (its own date filters replaced). Snapshots pass through. */
export function applyPeriod(w: Widget, p: ResolvedPeriod, opts: Apply): Widget {
  const query = retarget(w.query, p.range, p.grain, opts);
  if (!query) return w;
  const out: Widget = { ...w, query };
  if (w.type === "kpi") {
    delete out.compare_query;
    delete out.compare_label;
    if (p.compare) {
      const cq = retarget({ ...w.query, group_by: undefined }, p.compare, p.grain, opts);
      if (cq) {
        out.compare_query = cq;
        out.compare_label = `vs ${p.compareLabel}`;
      }
    }
  }
  return out;
}
