import ExcelJS from "exceljs";

/**
 * Branded Excel export helpers for the rep portal, so the customers and orders
 * downloads look like FMG rather than a raw data dump. One navy title band, a
 * navy header row, zebra striping, autofilter, and consistent number formats —
 * shared here so both exports stay identical.
 *
 * Colours are FMG's brand navy (globals.css --color-brand-*). ExcelJS wants
 * 8-digit ARGB hex.
 */

export const BRAND = {
  navy: "FF1B3C53", // brand-700 — title band + header row
  zebra: "FFF2F8FB", // brand-50 — alternating row tint
  white: "FFFFFFFF",
  ink: "FF28312C",
  muted: "FF5A655E",
  line: "FFE4EFF6", // brand-100 — cell borders
};

export const MONEY_FMT = "$#,##0.00";

export type ExportColumn = { header: string; key: string; width: number; numFmt?: string };

/** A fresh workbook stamped as FMG's. */
export function brandWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fragrance Marketing Group";
  wb.company = "Fragrance Marketing Group";
  return wb;
}

/**
 * Add a worksheet with the FMG masthead: a navy company band (row 1), a muted
 * title/date line (row 2), and a navy header row (row 3, frozen). Data starts on
 * row 4. Returns the worksheet; call `finishSheet` after adding rows.
 */
export function addBrandedSheet(
  wb: ExcelJS.Workbook,
  opts: { name: string; title: string; subtitle?: string; columns: ExportColumn[] },
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(opts.name, {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  const n = opts.columns.length;
  ws.columns = opts.columns.map((c) => ({ key: c.key, width: c.width }));

  // Row 1 — company band.
  ws.mergeCells(1, 1, 1, n);
  const band = ws.getCell(1, 1);
  band.value = "FRAGRANCE MARKETING GROUP";
  band.font = { name: "Arial", bold: true, size: 14, color: { argb: BRAND.white } };
  band.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.navy } };
  band.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 28;

  // Row 2 — report title + optional subtitle (e.g. generated date, filters).
  ws.mergeCells(2, 1, 2, n);
  const sub = ws.getCell(2, 1);
  sub.value = opts.subtitle ? `${opts.title}  ·  ${opts.subtitle}` : opts.title;
  sub.font = { name: "Arial", size: 10, color: { argb: BRAND.muted } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 18;

  // Row 3 — column headers.
  const header = ws.getRow(3);
  opts.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Arial", bold: true, color: { argb: BRAND.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.navy } };
    cell.alignment = { vertical: "middle", horizontal: c.numFmt ? "right" : "left" };
    if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
  });
  header.height = 20;

  return ws;
}

/**
 * Style the data rows added after `addBrandedSheet`: Arial body, zebra striping,
 * a hairline under each row, and an autofilter on the header. Call once, after
 * every data row is in.
 */
export function finishSheet(ws: ExcelJS.Worksheet, columnCount: number, headerRow = 3): void {
  const last = ws.rowCount;
  for (let r = headerRow + 1; r <= last; r++) {
    const row = ws.getRow(r);
    row.font = { name: "Arial", size: 10, color: { argb: BRAND.ink } };
    const zebra = (r - headerRow) % 2 === 0;
    for (let c = 1; c <= columnCount; c++) {
      const cell = row.getCell(c);
      if (zebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }
      cell.border = { bottom: { style: "thin", color: { argb: BRAND.line } } };
    }
  }
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: columnCount },
  };
}

/** e.g. "Generated Jul 24, 2026" in FMG's local (Central) time. */
export function generatedLabel(): string {
  return `Generated ${new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  })}`;
}

/** Stream a workbook as an .xlsx download response. */
export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
