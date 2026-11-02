import ExcelJS from "exceljs";
import type { UserRole } from "@/components/UserContext";
import { datasetDateColumn, datasetInfo, runQuery, type QuerySpec } from "@/lib/assistant/dataCatalog";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseGroupKey } from "./dates";
import type { DateRange } from "./reportPeriod";
import type { PeriodRun } from "./run";
import { buttonPng, fixInternalPictureLinks, type ButtonStyle } from "./excelButtons";
import { chartData, formatCell, formatOf, labelFor, metricKeys, pivotize } from "./shape";
import type { Report, ValueFormat, Widget, WidgetResult } from "./types";

/*
 * A report as an Excel workbook, built to be checked, not just read:
 *   Read Me            — what the report is, its period, where every number comes
 *                        from, and who to ask.
 *   Summary            — the headline numbers; each one a SUMIFS over the data tab
 *                        where the KPI can be expressed that way.
 *   <Metric> by Month  — months across, channel → brand down, all SUMIFS.
 *   one tab per chart / table / pivot, with SUM totals.
 *   Data – <dataset>   — the rows pulled from the database for the period (and the
 *                        comparison period): the source every formula points at.
 * Every tab opens with the same header: report title, a row of links to the other
 * tabs, and a line saying what the tab is. The header stays inside columns A–H.
 * Every number reflects the report's period (the one on screen when exported).
 */

const NAVY = "FF1B3C53";
const NAV_FILL = "FFE8EEF3";
const MUTED = "FF6B7B88";
const NUM_FMT: Record<ValueFormat, string> = { money: '"$"#,##0', number: "#,##0.##", percent: "0.0%" };
const MONTH_FMT = "mmm-yy";
const DATE_FMT = "mmm d, yyyy";
const HEADER_COLS = 8; // A–H
const TABLE_TOP = 5; // first table row (the header row) on every tab
const DATA_ROW_CAP = 60_000;
const MONEY = /revenue|sales|price|amount|aov|subtotal|cost|msrp|^total$|shipping|tax|discount|fees|value/i;

type Tab = { name: string; about: string; ws: ExcelJS.Worksheet };
type DataTab = Tab & {
  dataset: string;
  /** column key → its column letter on the data tab */
  letters: Map<string, string>;
  first: number;
  last: number;
  rows: Record<string, unknown>[];
  /** Filters every widget on this dataset shares — applied when pulling the rows. */
  filters: NonNullable<QuerySpec["filters"]>;
  truncated: boolean;
};

/* ── Small helpers ─────────────────────────────────────────────────────── */

/** Excel caps tab names at 31 characters — cut long ones at a word, with an ellipsis. */
function fit(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,–(-]+$/, "")}…`;
}

function tabName(raw: string, used: Set<string>): string {
  const base = fit(raw.replace(/[:\\/?*[\]']/g, " ").replace(/\s+/g, " ").trim() || "Sheet", 31);
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${fit(base, 26)} (${n})`;
  used.add(name.toLowerCase());
  return name;
}

const ref = (sheet: string) => `'${sheet}'`;
const toDate = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const num = (v: unknown) => (typeof v === "number" ? v : v == null || v === "" ? 0 : Number(v) || 0);
function plain(v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return JSON.stringify(v);
}
const quoteCrit = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

function styleTableHeader(ws: ExcelJS.Worksheet, row: number, cols: number) {
  const r = ws.getRow(row);
  for (let c = 1; c <= cols; c++) {
    const cell = r.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }
}

function styleTotal(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.border = { top: { style: "thin", color: { argb: NAVY } } };
  }
}

/* ── The shared header (rows 1–3, columns A–H) ─────────────────────────── */

const NAV_ROW_PX = 40; // row 2 (30pt)
const BTN_H = 28;
const BTN_GAP = 6;
const BTN_MAX_W = 150;
/** Excel column width (characters) → pixels, at the default 11pt Calibri. */
const colPx = (ws: ExcelJS.Worksheet, c: number) => Math.round((ws.getColumn(c).width ?? 9.14) * 7 + 5);

/** A pixel offset from the left edge → exceljs's fractional column position. */
function colAt(ws: ExcelJS.Worksheet, x: number): number {
  let left = 0;
  for (let c = 1; c <= 200; c++) {
    const w = colPx(ws, c);
    if (x < left + w) return c - 1 + (x - left) / w;
    left += w;
  }
  return 0;
}

async function writeHeaders(wb: ExcelJS.Workbook, tabs: Tab[], reportTitle: string) {
  // Up to 8 buttons fit across A–H; past that the last one opens the Read Me's full list.
  const targets: { name: string; label: string }[] =
    tabs.length <= HEADER_COLS
      ? tabs.map((t) => ({ name: t.name, label: t.name }))
      : [...tabs.slice(0, HEADER_COLS - 1).map((t) => ({ name: t.name, label: t.name })), { name: tabs[0].name, label: "All tabs ▸" }];
  const images = new Map<string, number>();
  const image = async (label: string, w: number, style: ButtonStyle) => {
    const key = `${style}|${w}|${label}`;
    let id = images.get(key);
    if (id === undefined) {
      id = wb.addImage({ buffer: (await buttonPng(label, w, BTN_H, style)) as unknown as ExcelJS.Buffer, extension: "png" });
      images.set(key, id);
    }
    return id;
  };

  for (const tab of tabs) {
    const ws = tab.ws;
    // Every tab is at least A–H wide so the header reads cleanly.
    for (let c = 1; c <= HEADER_COLS; c++) if (!ws.getColumn(c).width) ws.getColumn(c).width = 14;

    ws.mergeCells(1, 1, 1, HEADER_COLS);
    const title = ws.getCell(1, 1);
    title.value = `FMG  ·  ${reportTitle}`;
    title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    title.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 26;

    // Row 2: a light band with fixed-size buttons floating on it (A–H).
    ws.getRow(2).height = (NAV_ROW_PX * 3) / 4;
    for (let c = 1; c <= HEADER_COLS; c++) ws.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAV_FILL } };
    let band = 0;
    for (let c = 1; c <= HEADER_COLS; c++) band += colPx(ws, c);
    const n = targets.length;
    const w = Math.max(60, Math.min(BTN_MAX_W, Math.floor((band - BTN_GAP * (n + 1)) / n)));
    for (let i = 0; i < n; i++) {
      const t = targets[i];
      const current = t.label === t.name && t.name === tab.name;
      const id = await image(t.label, w, current ? "current" : "link");
      const x = BTN_GAP + i * (w + BTN_GAP);
      ws.addImage(id, {
        tl: { col: colAt(ws, x), row: 1 + (NAV_ROW_PX - BTN_H) / 2 / NAV_ROW_PX },
        ext: { width: w, height: BTN_H },
        editAs: "absolute",
        ...(current ? {} : { hyperlinks: { hyperlink: `#${ref(t.name)}!A1`, tooltip: t.label === t.name ? `Go to ${t.name}` : "All tabs" } }),
      } as unknown as ExcelJS.ImageRange);
    }

    ws.mergeCells(3, 1, 3, HEADER_COLS);
    const about = ws.getCell(3, 1);
    about.value = `${tab.name} — ${tab.about}`;
    about.font = { italic: true, color: { argb: MUTED } };
    about.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    ws.getRow(3).height = 30;
  }
}

/* ── Data tabs: the rows behind the numbers ────────────────────────────── */

const DATE_OPS = new Set(["gt", "gte", "lt", "lte", "eq"]);

const DATA_TAB_NAMES: Record<string, string> = {
  sales_by_product_day: "Sales",
  sales_by_product_month: "Sales (monthly)",
  storefront_orders: "Orders",
  sales_orders: "Fishbowl orders",
  sales_order_items: "Fishbowl lines",
};

/** The non-date filters every widget on a dataset shares (so the tab covers all of them). */
function sharedFilters(widgets: Widget[], dataset: string): NonNullable<QuerySpec["filters"]> {
  const date = datasetDateColumn(dataset);
  const lists = widgets
    .flatMap((w) => [w.query, ...(w.compare_query ? [w.compare_query] : [])])
    .filter((q) => q.dataset === dataset)
    .map((q) => (q.filters ?? []).filter((f) => !(f.column === date && DATE_OPS.has(f.op))));
  if (!lists.length) return [];
  const key = (f: { column: string; op: string; value?: unknown }) => JSON.stringify([f.column, f.op, f.value]);
  return lists[0].filter((f) => lists.every((l) => l.some((g) => key(g) === key(f))));
}

async function pullRows(dataset: string, filters: NonNullable<QuerySpec["filters"]>, range: DateRange | null, role: UserRole) {
  const date = datasetDateColumn(dataset);
  const f = [...filters];
  if (range && date) f.push({ column: date, op: "gte", value: range.from }, { column: date, op: "lt", value: range.to });
  return runQuery({ dataset, filters: f }, role, { maxRows: DATA_ROW_CAP });
}

async function buildDataTab(
  wb: ExcelJS.Workbook,
  used: Set<string>,
  dataset: string,
  widgets: Widget[],
  run: PeriodRun,
  role: UserRole,
): Promise<DataTab | null> {
  const info = datasetInfo(dataset);
  if (!info) return null;
  const date = datasetDateColumn(dataset);
  const filters = sharedFilters(widgets, dataset);
  const current = await pullRows(dataset, filters, date ? run.period.range : null, role);
  const compare = date && run.period.compare ? await pullRows(dataset, filters, run.period.compare, role) : null;

  const name = tabName(`Data – ${DATA_TAB_NAMES[dataset] ?? info.title}`, used);
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: TABLE_TOP }] });
  const cols = current.columns;
  const keys = [...(date ? ["_period", "_month"] : []), ...cols];
  const letters = new Map<string, string>();
  keys.forEach((k, i) => letters.set(k, ws.getColumn(i + 1).letter));

  const header = ws.getRow(TABLE_TOP);
  header.values = keys.map((k) => (k === "_period" ? "Period" : k === "_month" ? "Month (for formulas)" : k));
  styleTableHeader(ws, TABLE_TOP, keys.length);

  const tagged: Record<string, unknown>[] = [
    ...current.rows.map((r) => ({ ...r, _period: "Current" })),
    ...(compare?.rows ?? []).map((r) => ({ ...r, _period: "Comparison" })),
  ];
  let at = TABLE_TOP + 1;
  for (const r of tagged) {
    const d = date ? toDate(r[date]) : null;
    const row = ws.getRow(at++);
    keys.forEach((k, i) => {
      const cell = row.getCell(i + 1);
      if (k === "_month") {
        cell.value = d ? monthStart(d) : null;
        cell.numFmt = MONTH_FMT;
      } else {
        const asDate = toDate(r[k]);
        cell.value = asDate ?? plain(r[k]);
        if (asDate) cell.numFmt = DATE_FMT;
        else if (typeof r[k] === "number" && MONEY.test(k)) cell.numFmt = NUM_FMT.money;
      }
    });
  }
  const last = Math.max(TABLE_TOP + 1, at - 1);
  ws.autoFilter = { from: { row: TABLE_TOP, column: 1 }, to: { row: TABLE_TOP, column: keys.length } };
  keys.forEach((k, i) => (ws.getColumn(i + 1).width = Math.min(Math.max(k.length + 3, 12), 34)));

  const truncated = current.truncated || !!compare?.truncated;
  const about =
    `Every row pulled from ${info.source} for ${run.period.label}` +
    (compare ? ` (Period = Current) and ${run.period.compareLabel} (Period = Comparison)` : "") +
    (filters.length ? `, filtered to ${filters.map((f) => `${f.column} ${f.op} ${JSON.stringify(f.value ?? "")}`).join(", ")}` : "") +
    `. ${tagged.length.toLocaleString()} rows${truncated ? ` — capped at ${DATA_ROW_CAP.toLocaleString()}, so totals here may fall short` : ""}.`;
  return { name, about, ws, dataset, letters, first: TABLE_TOP + 1, last, rows: tagged, filters, truncated };
}

/** SUMIFS / COUNTIFS for a query over its data tab, or null when it can't be expressed. */
function kpiFormula(q: QuerySpec, data: DataTab | undefined, period: "Current" | "Comparison"): string | null {
  if (!data || data.truncated) return null;
  const m = q.metrics?.[0];
  if (!m || q.group_by?.length || (m.fn !== "sum" && m.fn !== "count")) return null;
  const date = datasetDateColumn(q.dataset);
  const range = (k: string) => {
    const l = data.letters.get(k);
    return l ? `${ref(data.name)}!$${l}$${data.first}:$${l}$${data.last}` : null;
  };
  const crit: string[] = [];
  const periodRange = range("_period");
  if (periodRange) crit.push(periodRange, quoteCrit(period));
  const shared = new Set(data.filters.map((f) => JSON.stringify([f.column, f.op, f.value])));
  for (const f of q.filters ?? []) {
    if (f.column === date && DATE_OPS.has(f.op)) continue; // the Period column stands in for dates
    if (shared.has(JSON.stringify([f.column, f.op, f.value]))) continue; // already applied to the tab
    const r = range(f.column);
    if (!r) return null;
    if (f.op === "eq") crit.push(r, quoteCrit(f.value));
    else if (f.op === "neq") crit.push(r, quoteCrit(`<>${f.value}`));
    else return null;
  }
  if (m.fn === "count") return crit.length ? `COUNTIFS(${crit.join(",")})` : null;
  const sum = range(m.column ?? "");
  if (!sum) return null;
  return crit.length ? `SUMIFS(${sum},${crit.join(",")})` : `SUM(${sum})`;
}

/* ── Widget tabs ───────────────────────────────────────────────────────── */

function setWidths(ws: ExcelJS.Worksheet, labels: string[], first = 28) {
  labels.forEach((l, i) => (ws.getColumn(i + 1).width = i === 0 ? first : Math.min(Math.max(l.length + 3, 13), 30)));
}

function chartTab(ws: ExcelJS.Worksheet, w: Widget, r: Extract<WidgetResult, { ok: true }>) {
  const d = chartData(w, r, 12);
  const f = NUM_FMT[formatOf(w)];
  const head = [labelFor(d.xKey, w), ...d.series.map((s) => s.label), ...(d.series.length > 1 ? ["Total"] : [])];
  ws.getRow(TABLE_TOP).values = head;
  styleTableHeader(ws, TABLE_TOP, head.length);
  let at = TABLE_TOP + 1;
  for (const p of d.points) {
    const row = ws.getRow(at);
    row.getCell(1).value = String(p.x);
    d.series.forEach((s, i) => {
      const c = row.getCell(i + 2);
      c.value = num(p[s.key]);
      c.numFmt = f;
    });
    if (d.series.length > 1) {
      const lastL = ws.getColumn(d.series.length + 1).letter;
      const c = row.getCell(d.series.length + 2);
      c.value = { formula: `SUM(B${at}:${lastL}${at})`, result: d.series.reduce((a, s) => a + num(p[s.key]), 0) };
      c.numFmt = f;
    }
    at++;
  }
  const total = ws.getRow(at);
  total.getCell(1).value = "Total";
  for (let c = 2; c <= head.length; c++) {
    const L = ws.getColumn(c).letter;
    const cell = total.getCell(c);
    cell.value = { formula: `SUM(${L}${TABLE_TOP + 1}:${L}${at - 1})` };
    cell.numFmt = f;
  }
  styleTotal(total, head.length);
  setWidths(ws, head);
}

function pivotTab(ws: ExcelJS.Worksheet, w: Widget, r: Extract<WidgetResult, { ok: true }>) {
  const p = pivotize(w, r, 200);
  const f = NUM_FMT[formatOf(w, p.valueKey)];
  const head = [labelFor(p.rowKey, w), ...p.colLabels.map((c) => formatCell(c === "—" ? null : c, p.colKey, w)), "Total"];
  ws.getRow(TABLE_TOP).values = head;
  styleTableHeader(ws, TABLE_TOP, head.length);
  const lastValL = ws.getColumn(p.colLabels.length + 1).letter;
  p.rowLabels.forEach((rk, i) => {
    const at = TABLE_TOP + 1 + i;
    const row = ws.getRow(at);
    row.getCell(1).value = formatCell(rk === "—" ? null : rk, p.rowKey, w);
    p.cells[i].forEach((v, j) => {
      const c = row.getCell(j + 2);
      c.value = v ?? 0;
      c.numFmt = f;
    });
    const t = row.getCell(head.length);
    t.value = { formula: `SUM(B${at}:${lastValL}${at})`, result: p.rowTotals[i] };
    t.numFmt = f;
  });
  const at = TABLE_TOP + 1 + p.rowLabels.length;
  const total = ws.getRow(at);
  total.getCell(1).value = "Total";
  for (let c = 2; c <= head.length; c++) {
    const L = ws.getColumn(c).letter;
    total.getCell(c).value = { formula: `SUM(${L}${TABLE_TOP + 1}:${L}${at - 1})` };
    total.getCell(c).numFmt = f;
  }
  styleTotal(total, head.length);
  setWidths(ws, head);
}

function tableTab(ws: ExcelJS.Worksheet, w: Widget, r: Extract<WidgetResult, { ok: true }>) {
  const metrics = new Set(metricKeys(w));
  const head = r.columns.map((c) => labelFor(c, w));
  ws.getRow(TABLE_TOP).values = head;
  styleTableHeader(ws, TABLE_TOP, head.length);
  let at = TABLE_TOP + 1;
  for (const row of r.rows) {
    const xr = ws.getRow(at++);
    r.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      const v = row[c];
      if (parseGroupKey(c).bucket && typeof v === "string") cell.value = formatCell(v, c, w);
      else cell.value = toDate(v) ?? plain(v);
      if (toDate(v) && !parseGroupKey(c).bucket) cell.numFmt = DATE_FMT;
      if (metrics.has(c)) cell.numFmt = NUM_FMT[formatOf(w, c)];
      else if (typeof v === "number" && MONEY.test(c)) cell.numFmt = NUM_FMT.money;
    });
  }
  if (metrics.size && r.rows.length) {
    const total = ws.getRow(at);
    total.getCell(1).value = "Total";
    r.columns.forEach((c, i) => {
      if (!metrics.has(c)) return;
      const L = ws.getColumn(i + 1).letter;
      total.getCell(i + 1).value = { formula: `SUM(${L}${TABLE_TOP + 1}:${L}${at - 1})` };
      total.getCell(i + 1).numFmt = NUM_FMT[formatOf(w, c)];
    });
    styleTotal(total, head.length);
  }
  ws.autoFilter = { from: { row: TABLE_TOP, column: 1 }, to: { row: TABLE_TOP, column: head.length } };
  setWidths(ws, head);
}

/* ── Trend tab: months across, channel → brand down ────────────────────── */

function monthsIn(r: DateRange): Date[] {
  const out: Date[] = [];
  const end = new Date(`${r.to}T00:00:00Z`);
  for (let d = monthStart(new Date(`${r.from}T00:00:00Z`)); d < end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) out.push(d);
  return out;
}

const SALES = new Set(["sales_by_product_day", "sales_by_product_month"]);

function trendTab(ws: ExcelJS.Worksheet, data: DataTab, run: PeriodRun, title: string) {
  const months = monthsIn(run.period.range);
  const cols = data.letters;
  const sales = SALES.has(data.dataset);
  const valueKey = sales ? "revenue" : cols.has("total") ? "total" : null;
  const f = valueKey ? NUM_FMT.money : NUM_FMT.number;
  const R = (k: string) => `${ref(data.name)}!$${cols.get(k)}$${data.first}:$${cols.get(k)}$${data.last}`;
  // Revenue is Sale lines only (house rule) — unless the tab is already filtered that way.
  const base = [R("_period"), quoteCrit("Current"), ...(sales && cols.has("typename") && !data.filters.some((x) => x.column === "typename") ? [R("typename"), quoteCrit("Sale")] : [])];
  const fn = (extra: string[]) => (valueKey ? `SUMIFS(${R(valueKey)},${[...base, ...extra].join(",")})` : `COUNTIFS(${[...base, ...extra].join(",")})`);

  const distinct = (k: string) =>
    [...new Set(data.rows.filter((r) => r._period === "Current").map((r) => (r[k] == null || r[k] === "" ? "" : String(r[k]))))].sort();
  const outer = sales ? "segment" : cols.has("source") ? "source" : null;
  const inner = sales ? "brand" : null;

  const head = [outer ? (sales ? "Channel / brand" : "Source") : "Total", ...months.map(() => ""), "Total"];
  const hr = ws.getRow(TABLE_TOP);
  hr.values = head;
  months.forEach((m, i) => {
    const c = hr.getCell(i + 2);
    c.value = m;
    c.numFmt = MONTH_FMT;
  });
  styleTableHeader(ws, TABLE_TOP, head.length);
  const monthCrit = (i: number) => [R("_month"), `${ws.getColumn(i + 2).letter}$${TABLE_TOP}`];
  const lastMonthL = ws.getColumn(months.length + 1).letter;
  const totalCol = months.length + 2;

  let at = TABLE_TOP + 1;
  const writeRow = (label: string, extra: string[], opts: { bold?: boolean; indent?: number } = {}) => {
    const row = ws.getRow(at);
    row.getCell(1).value = label;
    row.getCell(1).alignment = { indent: opts.indent ?? 0 };
    months.forEach((_, i) => {
      const c = row.getCell(i + 2);
      c.value = { formula: fn([...extra, ...monthCrit(i)]) };
      c.numFmt = f;
    });
    const t = row.getCell(totalCol);
    t.value = { formula: `SUM(B${at}:${lastMonthL}${at})` };
    t.numFmt = f;
    if (opts.bold) row.font = { bold: true };
    return at++;
  };
  const sumRows = (label: string, rows: number[], bold = true) => {
    const row = ws.getRow(at);
    row.getCell(1).value = label;
    for (let c = 2; c <= totalCol; c++) {
      const L = ws.getColumn(c).letter;
      row.getCell(c).value = { formula: rows.length ? rows.map((r) => `${L}${r}`).join("+") : "0" };
      row.getCell(c).numFmt = f;
    }
    if (bold) row.font = { bold: true };
    return at++;
  };

  const groupTotals: number[] = [];
  if (outer) {
    for (const o of distinct(outer)) {
      const oCrit = [R(outer), quoteCrit(o)];
      if (inner) {
        const innerRows = distinct(inner)
          .filter((i) => data.rows.some((r) => r._period === "Current" && String(r[outer] ?? "") === o && String(r[inner] ?? "") === i))
          .map((i) => writeRow(i || "(no brand)", [...oCrit, R(inner), quoteCrit(i)], { indent: 2 }));
        groupTotals.push(sumRows(`${o || "(none)"} total`, innerRows));
      } else {
        groupTotals.push(writeRow(o || "(none)", oCrit));
      }
    }
    const grand = sumRows("Grand total", groupTotals);
    styleTotal(ws.getRow(grand), head.length);
  } else {
    const t = writeRow("Total", []);
    styleTotal(ws.getRow(t), head.length);
  }
  ws.getColumn(1).width = 26;
  for (let c = 2; c <= totalCol; c++) ws.getColumn(c).width = 13;
  void title;
}

/* ── Read Me + Summary ─────────────────────────────────────────────────── */

async function ownerContact(report: Report): Promise<{ name: string; email: string | null }> {
  const { data } = await supabaseServer.from("profiles").select("*").eq("id", report.owner_id).maybeSingle();
  const p = data as { first_name: string | null; last_name: string | null; email: string | null } | null;
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || report.owner_name || "The report's owner";
  return { name, email: p?.email ?? null };
}

function readMeTab(ws: ExcelJS.Worksheet, report: Report, run: PeriodRun, tabs: Tab[], dataTabs: DataTab[], contact: { name: string; email: string | null }) {
  ws.getColumn(1).width = 24;
  for (let c = 2; c <= HEADER_COLS; c++) ws.getColumn(c).width = 16;
  let at = TABLE_TOP;
  const line = (label: string, value: ExcelJS.CellValue, opts: { bold?: boolean } = {}) => {
    ws.mergeCells(at, 2, at, HEADER_COLS);
    const l = ws.getCell(at, 1);
    l.value = label;
    l.font = { bold: true, color: { argb: NAVY } };
    l.alignment = { vertical: "top" };
    const v = ws.getCell(at, 2);
    v.value = value;
    v.alignment = { wrapText: true, vertical: "top" };
    if (opts.bold) v.font = { bold: true };
    const text = typeof value === "string" ? value : "";
    ws.getRow(at).height = Math.max(18, Math.ceil(text.length / 95) * 15);
    at++;
  };
  const section = (title: string) => {
    at++;
    ws.mergeCells(at, 1, at, HEADER_COLS);
    const c = ws.getCell(at, 1);
    c.value = title;
    c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    at++;
  };

  section("About this report");
  line("Report", report.title, { bold: true });
  if (report.description) line("What it shows", report.description);
  line("Period", run.period.label, { bold: true });
  line("Compared with", run.period.compareLabel ?? "No comparison");
  line(
    "Generated",
    new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) + " (Central)",
  );
  if (run.note) line("Note", run.note);

  section("What's in this workbook");
  for (const t of tabs) {
    if (t.name === tabs[0].name) continue;
    ws.mergeCells(at, 2, at, HEADER_COLS);
    const l = ws.getCell(at, 1);
    l.value = { text: t.name, hyperlink: `#${ref(t.name)}!A1` };
    l.font = { color: { argb: "FF2E6690" }, underline: true };
    const v = ws.getCell(at, 2);
    v.value = t.about;
    v.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(at).height = Math.max(18, Math.ceil(t.about.length / 95) * 15);
    at++;
  }

  section("Where the numbers come from");
  for (const d of dataTabs) {
    const info = datasetInfo(d.dataset);
    if (!info) continue;
    line(info.title, `${info.description} Source: the ${info.source} view in the FMG portal's database. The rows used are on the "${d.name}" tab.`);
  }
  line(
    "How to check a number",
    "Summary and the by-month tab are Excel formulas (SUMIFS) over the Data tabs, so you can click any number to see exactly which rows it adds up. Filter a Data tab to reproduce it by hand.",
  );
  line("Rules applied", "Revenue counts Fishbowl “Sale” lines only — discounts, shipping and credits are left out. Storefront figures count paid orders only. Dates are Central time.");

  section("Questions?");
  line("Contact", contact.email ? `${contact.name} — ${contact.email}` : contact.name, { bold: true });
  line("Live version", "Open the report in the FMG portal (Reports) to see today's numbers or change the period.");
}

function summaryTab(ws: ExcelJS.Worksheet, kpis: Widget[], byId: Map<string, WidgetResult>, run: PeriodRun, dataBy: Map<string, DataTab>) {
  const p = run.period;
  const head = ["Metric", p.label, p.compareLabel ?? "Comparison", "Change", "Change %"];
  ws.getRow(TABLE_TOP).values = head;
  styleTableHeader(ws, TABLE_TOP, head.length);
  ws.getColumn(1).width = 38;
  for (let c = 2; c <= HEADER_COLS; c++) ws.getColumn(c).width = 18;
  let at = TABLE_TOP + 1;
  if (!kpis.length) {
    ws.getCell(at, 1).value = "This report has no headline numbers — see the other tabs.";
    return;
  }
  for (const w of kpis) {
    const r = byId.get(w.id);
    const row = ws.getRow(at);
    row.getCell(1).value = w.title;
    if (!r?.ok) {
      row.getCell(2).value = r ? `Couldn't load: ${r.error}` : "Not run";
      at++;
      continue;
    }
    const f = NUM_FMT[formatOf(w)];
    const data = dataBy.get(w.query.dataset);
    const cur = kpiFormula(w.query, data, "Current");
    row.getCell(2).value = cur ? { formula: cur, result: r.value ?? 0 } : (r.value ?? null);
    if (w.compare_query) {
      const cmp = kpiFormula(w.compare_query, dataBy.get(w.compare_query.dataset), "Comparison");
      row.getCell(3).value = cmp ? { formula: cmp, result: r.compare ?? 0 } : (r.compare ?? null);
      row.getCell(4).value = { formula: `IF(C${at}="","",B${at}-C${at})` };
      row.getCell(5).value = { formula: `IF(OR(C${at}="",C${at}=0),"",B${at}/C${at}-1)` };
    }
    [2, 3, 4].forEach((c) => (row.getCell(c).numFmt = f));
    row.getCell(5).numFmt = "+0.0%;-0.0%";
    at++;
  }
}

/* ── The workbook ──────────────────────────────────────────────────────── */

export async function buildReportWorkbook(report: Report, run: PeriodRun, role: UserRole): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FMG Portal — Reports";
  wb.created = new Date();
  // The SUMIFS cells carry no cached values — have Excel work them out on open.
  wb.calcProperties.fullCalcOnLoad = true;
  const used = new Set<string>();
  const byId = new Map(run.results.map((r) => [r.id, r]));
  const widgets = run.widgets;
  const tabs: Tab[] = [];
  const add = (name: string, about: string, freeze = true) => {
    const n = tabName(name, used);
    const ws = wb.addWorksheet(n, freeze ? { views: [{ state: "frozen", ySplit: TABLE_TOP }] } : {});
    const t = { name: n, about, ws };
    tabs.push(t);
    return t;
  };
  const periodText = `${run.period.label}${run.period.compareLabel ? `, compared with ${run.period.compareLabel}` : ""}`;

  const readMe = add("Read Me", "what this report is, the period it covers, where the data comes from, and who to ask.", false);
  const kpis = widgets.filter((w) => w.type === "kpi");
  const summary = add("Summary", `the headline numbers for ${periodText}. Formulas point at the Data tabs.`);

  // Data first (in memory) so Summary and the trend can point at it; tabs are ordered at the end.
  const datasets = [...new Set(widgets.map((w) => w.query.dataset))];
  const dataTabs: DataTab[] = [];
  for (const ds of datasets) {
    const t = await buildDataTab(wb, used, ds, widgets, run, role);
    if (t) dataTabs.push(t);
  }
  const dataBy = new Map(dataTabs.map((d) => [d.dataset, d]));

  const trendData = dataTabs.find((d) => SALES.has(d.dataset)) ?? dataTabs.find((d) => d.letters.has("_month"));
  let trend: Tab | null = null;
  if (trendData) {
    const sales = SALES.has(trendData.dataset);
    const what = sales ? "Revenue" : trendData.letters.has("total") ? "Sales" : "Count";
    trend = add(
      `${what} by Month`,
      sales
        ? `revenue by month (across) for ${run.period.label}, by channel and brand (down). Every cell is a SUMIFS over "${trendData.name}".`
        : `${what.toLowerCase()} by month for ${run.period.label}. Every cell is a formula over "${trendData.name}".`,
    );
    trendTab(trend.ws, trendData, run, report.title);
  }

  for (const w of widgets) {
    if (w.type === "kpi") continue;
    const r = byId.get(w.id);
    const kind = w.type === "chart" ? "the numbers behind the chart" : w.type === "pivot" ? "the pivot" : "the table";
    const t = add(w.title, `${kind} “${w.title}” for ${run.period.label}${w.note ? ` — ${w.note}` : ""}.`);
    if (!r?.ok) {
      t.ws.getCell(TABLE_TOP, 1).value = r ? `Couldn't load: ${r.error}` : "Not run";
      continue;
    }
    if (w.type === "chart") chartTab(t.ws, w, r);
    else if (w.type === "pivot") pivotTab(t.ws, w, r);
    else tableTab(t.ws, w, r);
  }

  summaryTab(summary.ws, kpis, byId, run, dataBy);

  // Tab order: Read Me, Summary, trend, widgets, then the data.
  for (const d of dataTabs) tabs.push(d);
  const order = [readMe, summary, ...(trend ? [trend] : []), ...tabs.filter((t) => ![readMe, summary, trend].includes(t) && !dataTabs.includes(t as DataTab)), ...dataTabs];
  // exceljs writes sheets in orderNo order.
  order.forEach((t, i) => ((t.ws as unknown as { orderNo: number }).orderNo = i));

  readMeTab(readMe.ws, report, run, order, dataTabs, await ownerContact(report));
  await writeHeaders(wb, order, report.title);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  const buf = await wb.xlsx.writeBuffer();
  return fixInternalPictureLinks(buf as ArrayBuffer);
}

/** "Weekly-Sales-Flash-2026-10-31.xlsx" */
export function reportFilename(title: string): string {
  const slug = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "report";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
