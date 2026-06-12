/* ════════════════════════════════════════════════════════════
   Product copy workbook — ExcelJS build + parse (browser side)

   Export: one styled sheet, one row per FG product, columns from
   COPY_COLUMNS. Context columns are tinted gray (ignored on
   import); color cells are filled with their own hex so the
   palette is visible right in Excel.

   Import: reads the same sheet back by matching header text, so
   reordering or deleting columns in Excel is safe — a deleted
   column simply doesn't update that field.
   ════════════════════════════════════════════════════════════ */

import ExcelJS from "exceljs";

import {
  COPY_COLUMNS,
  type CopyRow,
  type EditableKey,
  type ImportIssue,
  type ParsedRow,
  mapHeaders,
  normalizeHexColor,
} from "./copySheet";

const SHEET_NAME = "Product Copy";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF111827" },
};
const CONTEXT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};

function argbFromHex(hex: string): string {
  return `FF${hex.slice(1).toUpperCase()}`;
}

/** Black or white text, whichever reads against the given hex. */
function contrastArgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "FF111827" : "FFFFFFFF";
}

/* ── Build ──────────────────────────────────────────────────── */

export async function buildCopyWorkbookBlob(rows: CopyRow[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FMG";
  const ws = wb.addWorksheet(SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = COPY_COLUMNS.map((c) => ({
    key: c.key,
    width: c.width,
  }));

  // Header
  const header = ws.addRow(COPY_COLUMNS.map((c) => c.header));
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle" };
  });
  header.height = 22;
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COPY_COLUMNS.length },
  };

  // Data
  for (const row of rows) {
    const excelRow = ws.addRow(
      COPY_COLUMNS.map((c) => (row as Record<string, unknown>)[c.key] ?? "")
    );
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = COPY_COLUMNS[colNumber - 1];
      cell.alignment = {
        vertical: "top",
        wrapText: col.wrap === true,
      };
      if (col.kind === "key") {
        cell.font = { bold: true, size: 10 };
      } else if (col.kind === "context") {
        cell.fill = CONTEXT_FILL;
        cell.font = { color: { argb: "FF6B7280" }, italic: true, size: 10 };
      } else if (col.kind === "color") {
        const hex = normalizeHexColor(String(cell.value ?? ""));
        if (hex) {
          cell.value = hex;
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: argbFromHex(hex) },
          };
          cell.font = { color: { argb: contrastArgb(hex) }, size: 10 };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
      }
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ── Parse ──────────────────────────────────────────────────── */

const EDITABLE_KEYS = new Set<string>(
  COPY_COLUMNS.filter((c) => c.kind === "text" || c.kind === "color").map((c) => c.key)
);

export async function parseCopyWorkbookFile(file: File): Promise<{
  rows: ParsedRow[];
  presentKeys: EditableKey[];
  issues: ImportIssue[];
}> {
  const issues: ImportIssue[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];
  if (!ws) {
    return { rows: [], presentKeys: [], issues: [{ part: null, message: "Workbook has no sheets." }] };
  }

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cell.text ?? "";
  });

  const keysByCol = mapHeaders(headers);
  const partCol = keysByCol.indexOf("part");
  if (partCol === -1) {
    return {
      rows: [],
      presentKeys: [],
      issues: [{ part: null, message: 'No "SKU" column found — is this the exported copy sheet?' }],
    };
  }

  const presentKeys = keysByCol.filter(
    (k): k is EditableKey => k !== null && EDITABLE_KEYS.has(k)
  );

  const rows: ParsedRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const part = row.getCell(partCol + 1).text.trim();
    if (!part) return;

    const values: Partial<Record<EditableKey, string>> = {};
    keysByCol.forEach((key, idx) => {
      if (!key || !EDITABLE_KEYS.has(key)) return;
      values[key as EditableKey] = row.getCell(idx + 1).text ?? "";
    });
    rows.push({ part, values });
  });

  return { rows, presentKeys, issues };
}
