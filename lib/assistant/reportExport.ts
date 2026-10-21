import ExcelJS from "exceljs";
import type { UserRole } from "@/components/UserContext";
import { runQuery, toCsv, type QuerySpec, type QueryResult } from "./dataCatalog";

/**
 * Sage's downloadable reports: an Excel workbook with one tab per sheet (or a
 * CSV when there's a single sheet and CSV was asked for).
 *
 * A sheet is either a `query` over the data catalog — re-run here under the
 * downloader's own permissions — or a small `table` Sage assembled from numbers
 * it already pulled (e.g. a regional summary tab).
 */

export type ExportSheet = {
  name: string;
  query?: QuerySpec;
  table?: { columns: string[]; rows: (string | number | null)[][] };
};

export type ExportSpec = { title: string; format: "xlsx" | "csv"; sheets: ExportSheet[] };

const MAX_SHEETS = 12;
const MAX_ROWS = 20_000;
const MAX_TABLE_ROWS = 500;

/** Excel tab names: ≤31 chars, none of : \ / ? * [ ], unique. */
function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    const base = (raw.replace(/[:\\/?*[\]]/g, " ").trim() || `Sheet ${i + 1}`).slice(0, 31);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 27)} (${n})`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** Parse what Sage (or a saved download button) sent. Accepts the older single-query shape too. */
export function readExportSpec(raw: unknown, fallbackTitle = "Report"): ExportSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  // Legacy: a bare QuerySpec from before multi-sheet exports.
  if (typeof r.dataset === "string") {
    return { title: fallbackTitle, format: "csv", sheets: [{ name: fallbackTitle, query: r as unknown as QuerySpec }] };
  }
  const sheetsIn = Array.isArray(r.sheets) ? (r.sheets as Record<string, unknown>[]).slice(0, MAX_SHEETS) : [];
  if (!sheetsIn.length) throw new Error("A report needs at least one sheet.");
  const names = sheetNames(sheetsIn.map((s) => (typeof s.name === "string" ? s.name : "")));
  const sheets: ExportSheet[] = sheetsIn.map((s, i) => {
    if (s.query && typeof s.query === "object") return { name: names[i], query: s.query as QuerySpec };
    const t = s.table as { columns?: unknown; rows?: unknown } | undefined;
    if (t && Array.isArray(t.columns) && Array.isArray(t.rows)) {
      return {
        name: names[i],
        table: {
          columns: t.columns.map(String).slice(0, 50),
          rows: (t.rows as unknown[])
            .filter(Array.isArray)
            .slice(0, MAX_TABLE_ROWS)
            .map((row) => (row as unknown[]).map((v) => (typeof v === "number" || v === null ? v : String(v ?? "")))),
        },
      };
    }
    throw new Error(`Sheet "${names[i]}" needs a query or a table.`);
  });
  const format = r.format === "csv" && sheets.length === 1 ? "csv" : "xlsx";
  const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 80) : fallbackTitle;
  return { title, format, sheets };
}

async function sheetData(sheet: ExportSheet, role: UserRole, maxRows: number): Promise<QueryResult> {
  if (sheet.query) return runQuery({ ...sheet.query, limit: maxRows }, role, { maxRows, scanLimit: 200_000 });
  const t = sheet.table!;
  const rows = t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));
  return { dataset: "table", title: sheet.name, columns: t.columns, rows, total: rows.length, truncated: false };
}

/** Check every sheet now (permissions, column names) and count its rows, so problems surface in the chat. */
export async function probeExport(spec: ExportSpec, role: UserRole) {
  return Promise.all(
    spec.sheets.map(async (s) => {
      const r = s.query ? await runQuery({ ...s.query, limit: 1 }, role, { maxRows: 1 }) : await sheetData(s, role, 1);
      // Grouped queries report scanned rows as `total`; count groups instead.
      const grouped = !!(s.query?.group_by?.length || s.query?.metrics?.length);
      const rows = grouped ? (await sheetData(s, role, MAX_ROWS)).rows.length : r.total;
      return { sheet: s.name, rows };
    }),
  );
}

export function exportFilename(spec: ExportSpec): string {
  const slug = spec.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "report";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.${spec.format}`;
}

/** Build the file. */
export async function buildExport(spec: ExportSpec, role: UserRole): Promise<{ body: Uint8Array | string; contentType: string }> {
  if (spec.format === "csv") {
    const data = await sheetData(spec.sheets[0], role, MAX_ROWS);
    // BOM so Excel opens UTF-8 (accents, ™) correctly.
    return { body: "﻿" + toCsv(data), contentType: "text/csv; charset=utf-8" };
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sage — FMG Portal";
  wb.created = new Date();
  for (const sheet of spec.sheets) {
    const data = await sheetData(sheet, role, MAX_ROWS);
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = data.columns.map((c) => {
      const longest = Math.max(c.length, ...data.rows.slice(0, 200).map((r) => String(r[c] ?? "").length));
      return { header: c, key: c, width: Math.min(Math.max(longest + 2, 10), 45) };
    });
    for (const row of data.rows) {
      ws.addRow(
        Object.fromEntries(
          data.columns.map((c) => {
            const v = row[c];
            return [c, v !== null && typeof v === "object" ? JSON.stringify(v) : v];
          }),
        ),
      );
    }
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3C53" } };
    if (data.columns.length) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: data.columns.length } };
    }
    // Money-looking columns get a currency format.
    data.columns.forEach((c, i) => {
      if (/revenue|sales_\d{4}|price|amount|aov|subtotal|cost|msrp|^total$/i.test(c)) ws.getColumn(i + 1).numFmt = '"$"#,##0.00';
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return {
    body: new Uint8Array(buf as ArrayBuffer),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
