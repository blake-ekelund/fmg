import ExcelJS from "exceljs";
import { parseGroupKey } from "./dates";
import { formatCell, formatOf, kpiDelta, labelFor, metricKeys, pivotize } from "./shape";
import type { Report, ValueFormat, WidgetResult } from "./types";

/* A report as an Excel workbook: a Summary tab with the KPI tiles, then one tab
   per table / pivot / chart (its underlying numbers). Same styling as Sage's
   exports (navy header, frozen, autofilter). */

const NUM_FMT: Record<ValueFormat, string> = { money: '"$"#,##0', number: "#,##0.##", percent: "0.0%" };

function tabName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[:\\/?*[\]]/g, " ").trim() || "Sheet").slice(0, 31);
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 27)} (${n})`;
  used.add(name.toLowerCase());
  return name;
}

function styleHeader(ws: ExcelJS.Worksheet, cols: number) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3C53" } };
  if (cols) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } };
}

function plain(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return JSON.stringify(v);
}

export async function buildReportWorkbook(report: Pick<Report, "title" | "widgets">, results: WidgetResult[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FMG Portal — Reports";
  wb.created = new Date();
  const used = new Set<string>();
  const byId = new Map(results.map((r) => [r.id, r]));

  const kpis = report.widgets.filter((w) => w.type === "kpi");
  if (kpis.length) {
    const ws = wb.addWorksheet(tabName("Summary", used), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Metric", key: "m", width: 36 },
      { header: "Value", key: "v", width: 16 },
      { header: "Compared to", key: "c", width: 16 },
      { header: "Change", key: "d", width: 12 },
    ];
    for (const w of kpis) {
      const r = byId.get(w.id);
      if (!r?.ok) {
        ws.addRow({ m: w.title, v: r ? r.error : "Not run" });
        continue;
      }
      const row = ws.addRow({ m: w.title, v: r.value ?? null, c: r.compare ?? null, d: kpiDelta(r.value, r.compare) });
      const f = NUM_FMT[formatOf(w)];
      row.getCell(2).numFmt = f;
      row.getCell(3).numFmt = f;
      row.getCell(4).numFmt = "+0.0%;-0.0%";
    }
    styleHeader(ws, 4);
  }

  for (const w of report.widgets) {
    if (w.type === "kpi") continue;
    const r = byId.get(w.id);
    const ws = wb.addWorksheet(tabName(w.title, used), { views: [{ state: "frozen", ySplit: 1 }] });
    if (!r?.ok) {
      ws.addRow([r ? `Couldn't load: ${r.error}` : "Not run"]);
      continue;
    }
    if (w.type === "pivot") {
      const p = pivotize(w, r, 200);
      ws.addRow([labelFor(p.rowKey, w), ...p.colLabels.map((c) => formatCell(c === "—" ? null : c, p.colKey, w)), "Total"]);
      p.rowLabels.forEach((rk, i) => ws.addRow([rk, ...p.cells[i], p.rowTotals[i]]));
      const total = ws.addRow(["Total", ...p.colTotals, p.grand]);
      total.font = { bold: true };
      const f = NUM_FMT[formatOf(w, p.valueKey)];
      for (let c = 2; c <= p.colLabels.length + 2; c++) ws.getColumn(c).numFmt = f;
      ws.getColumn(1).width = 32;
      styleHeader(ws, p.colLabels.length + 2);
      continue;
    }
    const metrics = new Set(metricKeys(w));
    ws.columns = r.columns.map((c) => ({
      header: labelFor(c, w),
      key: c,
      width: Math.min(Math.max(labelFor(c, w).length + 2, ...r.rows.slice(0, 100).map((x) => String(x[c] ?? "").length + 2), 10), 45),
    }));
    for (const row of r.rows) ws.addRow(Object.fromEntries(r.columns.map((c) => [c, parseGroupKey(c).bucket && typeof row[c] === "string" ? formatCell(row[c], c, w) : plain(row[c])])));
    r.columns.forEach((c, i) => {
      if (metrics.has(c)) ws.getColumn(i + 1).numFmt = NUM_FMT[formatOf(w, c)];
      else if (/revenue|sales_\d{4}|price|amount|aov|subtotal|cost|msrp|^total$/i.test(c)) ws.getColumn(i + 1).numFmt = NUM_FMT.money;
    });
    styleHeader(ws, r.columns.length);
  }

  if (!wb.worksheets.length) wb.addWorksheet("Report").addRow(["This report has no widgets yet."]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** "Weekly-Sales-Flash-2026-10-31.xlsx" */
export function reportFilename(title: string): string {
  const slug = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "report";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
