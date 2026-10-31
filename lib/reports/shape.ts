import { parseGroupKey } from "./dates";
import type { ValueFormat, Widget, WidgetResult } from "./types";

/* Pure helpers that turn a widget's query result into what's drawn — shared by
   the Reports page, the scheduled email and the Excel attachment, so all three
   show the same numbers with the same labels. Client-safe. */

const MONEY = /revenue|sales|price|amount|aov|subtotal|cost|msrp|total|shipping|tax|discount|fees|value/i;

/** "sum_revenue" → "Revenue", "created_at:month" → "Month", "count" → "Count". */
export function labelFor(key: string, w?: Pick<Widget, "labels">): string {
  const custom = w?.labels?.[key];
  if (custom) return custom;
  const { column, bucket } = parseGroupKey(key);
  if (bucket) return bucket[0].toUpperCase() + bucket.slice(1);
  const m = column.match(/^(sum|avg|min|max|count)_(.+)$/);
  const base = (m ? m[2] : column).replace(/_/g, " ");
  const nice = base[0]?.toUpperCase() + base.slice(1);
  if (!m) return column === "count" ? "Count" : nice;
  return m[1] === "sum" ? nice : m[1] === "count" ? `# ${base}` : `${m[1][0].toUpperCase()}${m[1].slice(1)} ${base}`;
}

/** The value columns' format: explicit, else money when the metric looks like dollars. */
export function formatOf(w: Widget, key?: string): ValueFormat {
  if (w.format) return w.format;
  const col = key ?? metricKeys(w)[0] ?? "";
  if (/^count$|^count_/.test(col)) return "number";
  return MONEY.test(col) ? "money" : "number";
}

export function metricKeys(w: Widget): string[] {
  return (w.query.metrics ?? []).map((m) => (m.column ? `${m.fn}_${m.column}` : m.fn));
}

export function formatValue(v: unknown, f: ValueFormat, compact = false): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (f === "percent") return `${(n * (Math.abs(n) <= 1 ? 100 : 1)).toFixed(1)}%`;
  if (compact && Math.abs(n) >= 1000) {
    const s = Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${(n / 1e3).toFixed(Math.abs(n) >= 1e4 ? 0 : 1)}k`;
    return f === "money" ? `$${s}` : s;
  }
  return f === "money"
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        ...(Math.abs(n) >= 1000 || compact || Number.isInteger(n)
          ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      })
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Display a cell: bucketed dates read as "Oct 2026", "Q3 2026", "Week of Oct 5". */
export function formatCell(v: unknown, key: string, w: Widget): string {
  if (v === null || v === undefined || v === "") return "—";
  const { bucket } = parseGroupKey(key);
  if (bucket && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const y = v.slice(0, 4), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
    if (bucket === "year") return y;
    if (bucket === "quarter") return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    if (bucket === "month") return `${MONTHS[m - 1]} ${y}`;
    if (bucket === "week") return `Wk of ${MONTHS[m - 1]} ${d}`;
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  if (metricKeys(w).includes(key)) return formatValue(v, formatOf(w, key));
  // Identifiers (order / SO numbers, ids, zips) read as-is, without thousands commas.
  if (/^(number|num|id|soid|customerid)$|_id$|_num$|zip/i.test(key)) return String(v);
  if (typeof v === "number") return MONEY.test(key) ? formatValue(v, "money") : v.toLocaleString("en-US");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
  const s = String(v);
  // ISO timestamps → a readable date.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const t = new Date(s);
    if (!Number.isNaN(t.getTime())) return t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)}`;
  return s;
}

function sortKeys(keys: string[], key: string): string[] {
  const { bucket } = parseGroupKey(key);
  const dateLike = bucket || keys.every((k) => /^\d{4}-\d{2}/.test(k) || k === "—");
  return dateLike ? [...keys].sort() : keys;
}

export type Pivot = {
  rowKey: string;
  colKey: string;
  valueKey: string;
  rowLabels: string[];
  colLabels: string[];
  /** cells[r][c] */
  cells: (number | null)[][];
  rowTotals: number[];
  colTotals: number[];
  grand: number;
};

const keyOf = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** group_by [row, col] rows → a matrix with totals. Columns sorted (dates ascending), rows by total. */
export function pivotize(
  w: Widget,
  r: Extract<WidgetResult, { ok: true }>,
  maxCols = 24,
  keys: string[] = w.query.group_by ?? [],
): Pivot {
  const [rowKey, colKey] = keys;
  const valueKey = metricKeys(w)[0] ?? "count";
  const rowsSeen = new Map<string, Map<string, number>>();
  const colSet = new Set<string>();
  for (const row of r.rows) {
    const rk = keyOf(row[rowKey]);
    const ck = keyOf(row[colKey]);
    colSet.add(ck);
    const n = Number(row[valueKey]);
    if (!rowsSeen.has(rk)) rowsSeen.set(rk, new Map());
    const m = rowsSeen.get(rk)!;
    m.set(ck, (m.get(ck) ?? 0) + (Number.isFinite(n) ? n : 0));
  }
  let colLabels = sortKeys([...colSet], colKey);
  if (colLabels.length > maxCols) colLabels = colLabels.slice(-maxCols);
  const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;
  let rowLabels = [...rowsSeen.keys()];
  const totalOf = (rk: string) => sum(colLabels.map((c) => rowsSeen.get(rk)!.get(c) ?? 0));
  rowLabels = parseGroupKey(rowKey).bucket ? sortKeys(rowLabels, rowKey) : rowLabels.sort((a, b) => totalOf(b) - totalOf(a));
  const cells = rowLabels.map((rk) => colLabels.map((c) => rowsSeen.get(rk)!.get(c) ?? null));
  const rowTotals = rowLabels.map(totalOf);
  const colTotals = colLabels.map((_, i) => sum(cells.map((row) => row[i] ?? 0)));
  return { rowKey, colKey, valueKey, rowLabels, colLabels, cells, rowTotals, colTotals, grand: sum(rowTotals) };
}

export type ChartData = {
  xKey: string;
  /** One entry per series: data key + display label. */
  series: { key: string; label: string }[];
  points: Record<string, string | number | null>[];
};

/** group_by [x] (one series per metric) or [x, series] (one series per value, first metric). */
export function chartData(w: Widget, r: Extract<WidgetResult, { ok: true }>, maxSeries = 8): ChartData {
  const [xKey, seriesKey] = w.query.group_by ?? [];
  const metrics = metricKeys(w);
  if (!seriesKey) {
    const points = r.rows.map((row) => ({
      x: formatCell(row[xKey], xKey, w),
      _sort: keyOf(row[xKey]),
      ...Object.fromEntries(metrics.map((m) => [m, Number(row[m]) || 0])),
    }));
    if (parseGroupKey(xKey).bucket || points.every((p) => /^\d{4}-\d{2}/.test(p._sort))) points.sort((a, b) => a._sort.localeCompare(b._sort));
    return {
      xKey,
      series: metrics.map((m) => ({ key: m, label: labelFor(m, w) })),
      points: points.map(({ _sort, ...p }) => (void _sort, p)),
    };
  }
  const p = pivotize(w, r, 60, [seriesKey, xKey]);
  // The series are the pivot's rows (biggest first); the rest fold into "Other".
  const keep = p.rowLabels.slice(0, maxSeries);
  const other = p.rowLabels.length > maxSeries ? p.rowLabels.slice(maxSeries) : [];
  const series = keep.map((s, i) => ({ key: `s${i}`, label: formatCell(s === "—" ? null : s, seriesKey, w) }));
  if (other.length) series.push({ key: "other", label: "Other" });
  const points = p.colLabels.map((c, ci) => {
    const pt: Record<string, string | number | null> = { x: formatCell(c === "—" ? null : c, xKey, w) };
    keep.forEach((_, si) => (pt[`s${si}`] = p.cells[si][ci] ?? 0));
    if (other.length) pt.other = other.reduce((a, rk) => a + (p.cells[p.rowLabels.indexOf(rk)][ci] ?? 0), 0);
    return pt;
  });
  return { xKey, series, points };
}

/** KPI change vs the comparison, as a fraction (0.12 = +12%), or null. */
export function kpiDelta(value: number | null | undefined, compare: number | null | undefined): number | null {
  if (value == null || compare == null || compare === 0) return null;
  return (value - compare) / Math.abs(compare);
}
