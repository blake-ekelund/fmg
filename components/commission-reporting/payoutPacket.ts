/* ════════════════════════════════════════════════════════════
   Payout Packet Generator — Corporate Finance Report Style

   Produces a professional XLSX workbook per rep group using ExcelJS.
   Each workbook has 4 sheets in this order:
     1. Summary        — totals and breakdown
     2. Current Month  — all orders shipped in the selected month
                         (paid and withheld, flagged per row)
     3. All Withheld   — every unpaid invoice (current + carryover)
     4. Read Me        — explanation of tabs, formulas, and conventions

   Design spec (standard corporate finance reporting):
     - No gridlines anywhere
     - Dotted borders on data cells
     - Thick outside borders on header bands
     - Double-underline bottom on total rows
     - Auto-fit column widths based on actual content
     - Navy + gray palette, Calibri throughout
   ════════════════════════════════════════════════════════════ */

import ExcelJS from "exceljs";
import JSZip from "jszip";

export type PayoutOrder = {
  id: number;
  order_num: string;
  ship_date: string;
  customer_name: string | null;
  ship_address: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  customerpo: string | null;
  order_rep: string | null;
  net_sales: number;
  commission_paid: boolean;
  period: "current" | "carryover";
};

export type PayoutAgency = {
  code: string;
  displayName: string;
  rate: number;
  orders: PayoutOrder[];

  currentOrderCount: number;
  currentNetSales: number;
  currentPaidCommissions: number;
  currentWithheldCommissions: number;
  currentCommissions: number;

  carryoverOrderCount: number;
  carryoverNetSales: number;
  carryoverCommissions: number;

  totalWithheld: number;
  totalOwedAndPaid: number;
};

/* ════════════════════════════════════════════════════════════
   PALETTE — standard corporate finance report
   ════════════════════════════════════════════════════════════ */

const NAVY = "FF1F3864"; // dark navy — primary header color
const GRAY_DARK = "FF595959"; // subtitle / muted text
const GRAY_MED = "FFBFBFBF"; // borders
const GRAY_LIGHT = "FFF2F2F2"; // alternating row / subtle fill
const GRAY_HEADER = "FFD9D9D9"; // total row backdrop
const TEXT_BLACK = "FF000000";
const POSITIVE = "FF548235"; // muted green — paid amounts
const NEGATIVE = "FFC00000"; // muted red — unpaid amounts

const FONT = "Calibri";

/* ════════════════════════════════════════════════════════════
   BORDER + CELL HELPERS
   ════════════════════════════════════════════════════════════ */

type Cell = ExcelJS.Cell;
type Row = ExcelJS.Row;
type BorderKind = "data" | "header" | "total" | "subtotal";

function applyBorders(
  row: Row,
  colCount: number,
  kind: BorderKind,
  startCol = 1
) {
  const endCol = startCol + colCount - 1;
  for (let c = startCol; c <= endCol; c++) {
    const cell = row.getCell(c);
    const isFirst = c === startCol;
    const isLast = c === endCol;

    const dotted = { style: "dotted" as const, color: { argb: GRAY_MED } };
    const medium = { style: "medium" as const, color: { argb: NAVY } };
    const double = { style: "double" as const, color: { argb: NAVY } };
    const thin = { style: "thin" as const, color: { argb: GRAY_MED } };

    if (kind === "data") {
      cell.border = {
        top: dotted,
        bottom: dotted,
        left: isFirst ? dotted : undefined,
        right: isLast ? dotted : undefined,
      };
    } else if (kind === "header") {
      cell.border = {
        top: medium,
        bottom: medium,
        left: isFirst ? medium : thin,
        right: isLast ? medium : thin,
      };
    } else if (kind === "total") {
      cell.border = {
        top: medium,
        bottom: double,
        left: isFirst ? medium : dotted,
        right: isLast ? medium : dotted,
      };
    } else if (kind === "subtotal") {
      cell.border = {
        top: { style: "thin", color: { argb: NAVY } },
        bottom: { style: "double", color: { argb: NAVY } },
        left: isFirst ? thin : dotted,
        right: isLast ? thin : dotted,
      };
    }
  }
}

function companyHeader(cell: Cell, text: string) {
  cell.value = text;
  cell.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: NAVY },
  };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function reportTitle(cell: Cell, text: string) {
  cell.value = text;
  cell.font = {
    name: FONT,
    size: 16,
    bold: true,
    color: { argb: TEXT_BLACK },
  };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function reportSubtitle(cell: Cell, text: string) {
  cell.value = text;
  cell.font = {
    name: FONT,
    size: 10,
    color: { argb: GRAY_DARK },
  };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function sectionLabel(cell: Cell, text: string) {
  cell.value = text;
  cell.font = {
    name: FONT,
    size: 11,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function headerCellStyle(cell: Cell) {
  cell.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function textCell(cell: Cell, value: string | null | undefined, mono = false) {
  cell.value = value ?? "";
  cell.font = {
    name: mono ? "Consolas" : FONT,
    size: 10,
    color: { argb: TEXT_BLACK },
  };
  cell.alignment = {
    horizontal: "left",
    vertical: "middle",
    indent: 1,
  };
}

function moneyCell(cell: Cell, value: number, bold = false) {
  cell.value = value;
  cell.numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)';
  cell.font = {
    name: FONT,
    size: 10,
    bold,
    color: { argb: TEXT_BLACK },
  };
  cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
}

function intCell(cell: Cell, value: number) {
  cell.value = value;
  cell.numFmt = "#,##0";
  cell.font = { name: FONT, size: 10, color: { argb: TEXT_BLACK } };
  cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
}

function percentCell(cell: Cell, rate: number) {
  cell.value = rate / 100;
  cell.numFmt = "0.00%";
  cell.font = { name: FONT, size: 10, color: { argb: TEXT_BLACK } };
  cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
}

/* ---------- column auto-fit based on actual content ---------- */

function autoFit(
  ws: ExcelJS.Worksheet,
  opts: { min?: number; max?: number; padding?: number } = {}
) {
  const min = opts.min ?? 10;
  const max = opts.max ?? 60;
  const padding = opts.padding ?? 3;

  const maxByCol: Record<number, number> = {};

  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cell.isMerged) return;

      const v = cell.value;
      let text = "";

      if (v == null) {
        text = "";
      } else if (typeof v === "number") {
        const fmt = cell.numFmt || "";
        if (fmt.includes('"$"') || fmt.includes("$")) {
          const abs = Math.abs(v);
          text =
            "$" +
            abs.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          if (v < 0) text = "(" + text + ")";
        } else if (fmt.includes("%")) {
          text = (v * 100).toFixed(2) + "%";
        } else {
          text = v.toLocaleString("en-US");
        }
      } else if (v instanceof Date) {
        text = v.toLocaleDateString("en-US");
      } else if (typeof v === "string") {
        text = v;
      } else if (typeof v === "object") {
        const anyV = v as any;
        if (anyV.richText) {
          text = anyV.richText.map((r: any) => r.text ?? "").join("");
        } else if (anyV.text != null) {
          text = String(anyV.text);
        } else {
          text = String(v);
        }
      } else {
        text = String(v);
      }

      const fontSize = cell.font?.size ?? 10;
      const boldPad = cell.font?.bold ? 1 : 0;
      const factor = fontSize / 10;
      const len = text.length * factor + boldPad;

      if (!maxByCol[colNumber] || len > maxByCol[colNumber]) {
        maxByCol[colNumber] = len;
      }
    });
  });

  Object.entries(maxByCol).forEach(([col, width]) => {
    const w = Math.min(Math.max(width + padding, min), max);
    ws.getColumn(parseInt(col, 10)).width = w;
  });
}

/* ════════════════════════════════════════════════════════════
   SUMMARY SHEET
   ════════════════════════════════════════════════════════════ */

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  agency: PayoutAgency,
  periodLabel: string
) {
  const ws = wb.addWorksheet("Summary", {
    properties: { defaultRowHeight: 18 },
    pageSetup: { paperSize: 9, orientation: "portrait" },
    views: [{ showGridLines: false }],
  });

  ws.columns = [
    { width: 32 },
    { width: 22 },
    { width: 16 },
    { width: 16 },
  ];

  // Company header
  ws.mergeCells("A1:D1");
  companyHeader(ws.getCell("A1"), "Natural Inspirations");
  ws.getRow(1).height = 18;

  ws.mergeCells("A2:D2");
  reportTitle(ws.getCell("A2"), "Commission Payout Report");
  ws.getRow(2).height = 26;

  ws.mergeCells("A3:D3");
  reportSubtitle(
    ws.getCell("A3"),
    `${agency.displayName} (Code ${agency.code})  |  ${periodLabel}`
  );

  ws.mergeCells("A4:D4");
  reportSubtitle(
    ws.getCell("A4"),
    `Generated ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`
  );

  ws.addRow([]);

  // Headline: Total Due
  const headlineRow = ws.addRow([]).number;
  ws.mergeCells(`A${headlineRow}:B${headlineRow}`);
  ws.mergeCells(`C${headlineRow}:D${headlineRow}`);
  const labelCell = ws.getCell(`A${headlineRow}`);
  labelCell.value = "TOTAL DUE THIS PERIOD";
  labelCell.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  labelCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const amountCell = ws.getCell(`C${headlineRow}`);
  amountCell.value = agency.currentCommissions;
  amountCell.numFmt = '"$"#,##0.00';
  amountCell.font = {
    name: FONT,
    size: 14,
    bold: true,
    color: { argb: TEXT_BLACK },
  };
  amountCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: GRAY_LIGHT },
  };
  amountCell.alignment = {
    vertical: "middle",
    horizontal: "right",
    indent: 1,
  };
  applyBorders(ws.getRow(headlineRow), 4, "header");
  ws.getRow(headlineRow).height = 28;

  if (agency.carryoverCommissions > 0) {
    const cRow = ws.addRow([]).number;
    ws.mergeCells(`A${cRow}:B${cRow}`);
    ws.mergeCells(`C${cRow}:D${cRow}`);
    const clabel = ws.getCell(`A${cRow}`);
    clabel.value = "CARRY-OVER OUTSTANDING";
    clabel.font = {
      name: FONT,
      size: 9,
      bold: true,
      color: { argb: NEGATIVE },
    };
    clabel.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRAY_LIGHT },
    };
    clabel.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };

    const camount = ws.getCell(`C${cRow}`);
    camount.value = agency.carryoverCommissions;
    camount.numFmt = '"$"#,##0.00';
    camount.font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: NEGATIVE },
    };
    camount.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRAY_LIGHT },
    };
    camount.alignment = {
      vertical: "middle",
      horizontal: "right",
      indent: 1,
    };
    applyBorders(ws.getRow(cRow), 4, "data");
    ws.getRow(cRow).height = 22;
  }

  ws.addRow([]);
  ws.addRow([]);

  // This Month section
  const sectionRow1 = ws.addRow([]).number;
  ws.mergeCells(`A${sectionRow1}:D${sectionRow1}`);
  sectionLabel(ws.getCell(`A${sectionRow1}`), "THIS MONTH'S ACTIVITY");
  ws.getRow(sectionRow1).height = 22;

  const h1 = ws.addRow(["Metric", "Value", "", ""]);
  headerCellStyle(h1.getCell(1));
  headerCellStyle(h1.getCell(2));
  h1.getCell(2).alignment = {
    horizontal: "right",
    vertical: "middle",
    indent: 1,
  };
  applyBorders(h1, 2, "header");
  h1.height = 20;

  const metrics: Array<[string, number, "int" | "money" | "percent", boolean]> =
    [
      ["Orders Shipped", agency.currentOrderCount, "int", false],
      ["Net Sales", agency.currentNetSales, "money", false],
      ["Commission Rate", agency.rate, "percent", false],
      ["Commissions Paid", agency.currentPaidCommissions, "money", false],
      [
        "Commissions Withheld",
        agency.currentWithheldCommissions,
        "money",
        false,
      ],
      ["Total This Month", agency.currentCommissions, "money", true],
    ];

  let rowIdx = 0;
  for (const [label, value, kind, isTotal] of metrics) {
    const row = ws.addRow([label, null]);
    const labelC = row.getCell(1);
    labelC.font = {
      name: FONT,
      size: 10,
      bold: isTotal,
      color: { argb: TEXT_BLACK },
    };
    labelC.alignment = { indent: 1, vertical: "middle" };

    const valueC = row.getCell(2);
    if (kind === "int") intCell(valueC, value);
    else if (kind === "percent") percentCell(valueC, value);
    else moneyCell(valueC, value, isTotal);

    if (!isTotal && rowIdx % 2 === 0) {
      labelC.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: GRAY_LIGHT },
      };
      valueC.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: GRAY_LIGHT },
      };
    }

    if (isTotal) applyBorders(row, 2, "total");
    else applyBorders(row, 2, "data");
    rowIdx++;
  }

  // Carry-over section
  if (agency.carryoverCommissions > 0) {
    ws.addRow([]);
    const sectionRow2 = ws.addRow([]).number;
    ws.mergeCells(`A${sectionRow2}:D${sectionRow2}`);
    sectionLabel(
      ws.getCell(`A${sectionRow2}`),
      "CARRY-OVER (PRIOR MONTHS UNPAID)"
    );
    ws.getRow(sectionRow2).height = 22;

    const hr = ws.addRow(["Metric", "Value", "", ""]);
    headerCellStyle(hr.getCell(1));
    headerCellStyle(hr.getCell(2));
    hr.getCell(2).alignment = {
      horizontal: "right",
      vertical: "middle",
      indent: 1,
    };
    applyBorders(hr, 2, "header");
    hr.height = 20;

    const coMetrics: Array<[string, number, "int" | "money", boolean]> = [
      ["Unpaid Orders", agency.carryoverOrderCount, "int", false],
      ["Unpaid Net Sales", agency.carryoverNetSales, "money", false],
      ["Unpaid Commissions", agency.carryoverCommissions, "money", true],
    ];

    let rIdx = 0;
    for (const [label, value, kind, isTotal] of coMetrics) {
      const row = ws.addRow([label, null]);
      const lc = row.getCell(1);
      lc.font = {
        name: FONT,
        size: 10,
        bold: isTotal,
        color: { argb: isTotal ? NEGATIVE : TEXT_BLACK },
      };
      lc.alignment = { indent: 1, vertical: "middle" };
      const vc = row.getCell(2);
      if (kind === "int") intCell(vc, value);
      else moneyCell(vc, value, isTotal);
      if (isTotal) {
        vc.font = {
          name: FONT,
          size: 10,
          bold: true,
          color: { argb: NEGATIVE },
        };
      }

      if (!isTotal && rIdx % 2 === 0) {
        lc.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GRAY_LIGHT },
        };
        vc.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GRAY_LIGHT },
        };
      }

      if (isTotal) applyBorders(row, 2, "total");
      else applyBorders(row, 2, "data");
      rIdx++;
    }
  }

  ws.addRow([]);
  ws.addRow([]);

  // Footer note
  const noteRow = ws.addRow([]).number;
  ws.mergeCells(`A${noteRow}:D${noteRow}`);
  const noteCell = ws.getCell(`A${noteRow}`);
  noteCell.value =
    "Note: Net Sales = Sale line items + Discounts. Excludes freight, tax, displays, and testers. See the Read Me tab for full explanation.";
  noteCell.font = {
    name: FONT,
    size: 9,
    italic: true,
    color: { argb: GRAY_DARK },
  };
  noteCell.alignment = {
    wrapText: true,
    vertical: "top",
    horizontal: "left",
    indent: 1,
  };
  ws.getRow(noteRow).height = 32;

  autoFit(ws, { min: 14, max: 48, padding: 4 });
}

/* ════════════════════════════════════════════════════════════
   DETAIL SHEET BUILDER — shared between Current Month and All Withheld
   ════════════════════════════════════════════════════════════ */

type DetailMode = "current_month" | "withheld";

function buildDetailSheet(
  wb: ExcelJS.Workbook,
  mode: DetailMode,
  agency: PayoutAgency,
  orders: PayoutOrder[],
  periodLabel: string
) {
  const sheetName = mode === "current_month" ? "Current Month" : "All Withheld";
  const title =
    mode === "current_month" ? "Current Month Orders" : "All Withheld Orders";
  const subtitle =
    mode === "current_month"
      ? `Every order shipped in ${periodLabel} — paid and withheld combined`
      : "Every unpaid commission across all periods (this month + prior carry-over)";

  const ws = wb.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });

  // Columns: Customer, Address, City, ST, Zip, PO, Ship Date, Invoice #, Status/Period, Net Sales, Rate, Commission
  ws.columns = [
    { width: 28 }, // Customer
    { width: 28 }, // Address
    { width: 18 }, // City
    { width: 6 }, // ST
    { width: 10 }, // Zip
    { width: 16 }, // PO
    { width: 12 }, // Ship Date
    { width: 14 }, // Invoice #
    { width: 10 }, // Status/Period
    { width: 14 }, // Net Sales
    { width: 10 }, // Rate
    { width: 14 }, // Commission
  ];

  const colCount = 12;

  // Row 1: Company
  ws.mergeCells(1, 1, 1, colCount);
  companyHeader(ws.getCell(1, 1), "Natural Inspirations");
  ws.getRow(1).height = 18;

  // Row 2: Title
  ws.mergeCells(2, 1, 2, colCount);
  reportTitle(ws.getCell(2, 1), title);
  ws.getRow(2).height = 24;

  // Row 3: Agency + meta
  ws.mergeCells(3, 1, 3, colCount);
  const sub = ws.getCell(3, 1);
  sub.value = `${agency.displayName}  |  Code ${agency.code}  |  ${agency.rate}% commission`;
  sub.font = { name: FONT, size: 10, color: { argb: GRAY_DARK } };
  sub.alignment = { vertical: "middle", horizontal: "center" };

  // Row 4: Description
  ws.mergeCells(4, 1, 4, colCount);
  const desc = ws.getCell(4, 1);
  desc.value = subtitle;
  desc.font = {
    name: FONT,
    size: 9,
    italic: true,
    color: { argb: GRAY_DARK },
  };
  desc.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(4).height = 14;

  // Row 5: Column headers (frozen)
  const statusHeader = mode === "current_month" ? "Status" : "Period";
  const headerRow = ws.addRow([
    "Customer",
    "Address",
    "City",
    "ST",
    "Zip",
    "PO",
    "Ship Date",
    "Invoice #",
    statusHeader,
    "Net Sales",
    "Rate",
    "Commission",
  ]);
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c);
    headerCellStyle(cell);
    if (c === 9) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    } else if (c >= 10) {
      cell.alignment = {
        horizontal: "right",
        vertical: "middle",
        indent: 1,
      };
    }
  }
  applyBorders(headerRow, colCount, "header");
  headerRow.height = 22;

  // Data rows — sort by Customer Name (A→Z), then Ship Date (oldest→newest)
  const sorted = [...orders].sort((a, b) => {
    const nameCmp = (a.customer_name || "").localeCompare(
      b.customer_name || "",
      "en",
      { sensitivity: "base" }
    );
    if (nameCmp !== 0) return nameCmp;
    return (a.ship_date || "").localeCompare(b.ship_date || "");
  });

  let netSalesTotal = 0;
  let commissionTotal = 0;
  let paidCount = 0;
  let withheldCount = 0;

  sorted.forEach((o, idx) => {
    const commission = o.net_sales * (agency.rate / 100);
    netSalesTotal += o.net_sales;
    commissionTotal += commission;
    if (o.commission_paid) paidCount++;
    else withheldCount++;

    const statusLabel =
      mode === "current_month"
        ? o.commission_paid
          ? "Paid"
          : "Withheld"
        : o.period === "current"
          ? "Current"
          : "Prior";

    const row = ws.addRow([
      o.customer_name ?? "",
      (o.ship_address || "").split("\n")[0],
      o.ship_city ?? "",
      o.ship_state ?? "",
      o.ship_zip ?? "",
      o.customerpo ?? "",
      o.ship_date ?? "",
      o.order_num,
      statusLabel,
      null,
      null,
      null,
    ]);

    textCell(row.getCell(1), o.customer_name);
    textCell(row.getCell(2), (o.ship_address || "").split("\n")[0]);
    textCell(row.getCell(3), o.ship_city);
    textCell(row.getCell(4), o.ship_state);
    textCell(row.getCell(5), o.ship_zip);
    textCell(row.getCell(6), o.customerpo, true);
    textCell(row.getCell(7), o.ship_date);
    textCell(row.getCell(8), o.order_num, true);

    const statusCell = row.getCell(9);
    statusCell.value = statusLabel;
    const isNegativeStatus =
      mode === "current_month" ? !o.commission_paid : o.period !== "current";
    statusCell.font = {
      name: FONT,
      size: 9,
      bold: isNegativeStatus,
      italic: isNegativeStatus,
      color: { argb: isNegativeStatus ? NEGATIVE : POSITIVE },
    };
    statusCell.alignment = { horizontal: "center", vertical: "middle" };

    moneyCell(row.getCell(10), o.net_sales);
    percentCell(row.getCell(11), agency.rate);
    moneyCell(row.getCell(12), commission);

    // Zebra striping
    if (idx % 2 === 0) {
      for (let c = 1; c <= colCount; c++) {
        row.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GRAY_LIGHT },
        };
      }
    }

    applyBorders(row, colCount, "data");
  });

  // Total row
  if (sorted.length > 0) {
    const metaText =
      mode === "current_month"
        ? `${sorted.length} item${sorted.length === 1 ? "" : "s"}  ·  ${paidCount} paid / ${withheldCount} withheld`
        : `${sorted.length} unpaid item${sorted.length === 1 ? "" : "s"}`;

    const totalRow = ws.addRow([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      metaText,
      null,
      "",
      null,
    ]);
    for (let c = 1; c <= colCount; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: GRAY_HEADER },
      };
      cell.font = {
        name: FONT,
        size: 11,
        bold: true,
        color: { argb: TEXT_BLACK },
      };
      if (c === 9) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = {
          name: FONT,
          size: 9,
          italic: true,
          color: { argb: GRAY_DARK },
        };
      } else if (c >= 10) {
        cell.alignment = {
          horizontal: "right",
          vertical: "middle",
          indent: 1,
        };
      } else {
        cell.alignment = {
          horizontal: "left",
          vertical: "middle",
          indent: 1,
        };
      }
    }
    moneyCell(totalRow.getCell(10), netSalesTotal, true);
    totalRow.getCell(10).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRAY_HEADER },
    };
    moneyCell(totalRow.getCell(12), commissionTotal, true);
    totalRow.getCell(12).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRAY_HEADER },
    };
    totalRow.getCell(12).font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: mode === "withheld" ? NEGATIVE : TEXT_BLACK },
    };
    applyBorders(totalRow, colCount, "total");
    totalRow.height = 24;
  } else {
    const emptyRow = ws.addRow([]).number;
    ws.mergeCells(emptyRow, 1, emptyRow, colCount);
    const emptyCell = ws.getCell(emptyRow, 1);
    emptyCell.value =
      mode === "current_month"
        ? "No orders for this period."
        : "No outstanding commissions.";
    emptyCell.font = {
      name: FONT,
      size: 10,
      italic: true,
      color: { argb: GRAY_DARK },
    };
    emptyCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(emptyRow).height = 36;
  }

  autoFit(ws, { min: 8, max: 40, padding: 3 });
}

/* ════════════════════════════════════════════════════════════
   READ ME SHEET
   ════════════════════════════════════════════════════════════ */

function buildReadMeSheet(wb: ExcelJS.Workbook, agency: PayoutAgency) {
  const ws = wb.addWorksheet("Read Me", {
    properties: { defaultRowHeight: 18 },
    pageSetup: { paperSize: 9, orientation: "portrait" },
    views: [{ showGridLines: false }],
  });

  ws.columns = [{ width: 4 }, { width: 95 }];

  // Company
  ws.mergeCells("A1:B1");
  companyHeader(ws.getCell("A1"), "Natural Inspirations");
  ws.getRow(1).height = 18;

  // Title
  ws.mergeCells("A2:B2");
  reportTitle(ws.getCell("A2"), "How to Read This Report");
  ws.getRow(2).height = 26;

  ws.mergeCells("A3:B3");
  reportSubtitle(
    ws.getCell("A3"),
    `${agency.displayName} (Code ${agency.code})`
  );

  ws.addRow([]);

  const section = (title: string) => {
    const r = ws.addRow(["", ""]).number;
    ws.mergeCells(`A${r}:B${r}`);
    const cell = ws.getCell(`A${r}`);
    cell.value = title;
    cell.font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: NAVY },
    };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(r).height = 22;
  };

  const bullet = (text: string) => {
    const r = ws.addRow(["•", text]);
    r.getCell(1).font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: NAVY },
    };
    r.getCell(1).alignment = { vertical: "top", horizontal: "center" };
    r.getCell(2).font = { name: FONT, size: 10, color: { argb: TEXT_BLACK } };
    r.getCell(2).alignment = {
      vertical: "top",
      horizontal: "left",
      indent: 1,
      wrapText: true,
    };
    r.height = 28;
  };

  const paragraph = (text: string) => {
    const row = ws.addRow(["", text]);
    row.getCell(2).font = {
      name: FONT,
      size: 10,
      color: { argb: TEXT_BLACK },
    };
    row.getCell(2).alignment = {
      vertical: "top",
      horizontal: "left",
      indent: 1,
      wrapText: true,
    };
    row.height = 30;
  };

  const spacer = () => {
    ws.addRow([]);
  };

  // Intro
  paragraph(
    "This workbook contains your commission payout details for the selected month. " +
      "Each tab has a specific purpose — the summary tells you what you're owed, " +
      "the detail tabs give you invoice-by-invoice transparency."
  );

  spacer();

  section("  WHAT'S IN THIS REPORT");
  bullet(
    "Summary — The top-line numbers. Total due this period, breakdown of paid vs. withheld, " +
      "and any carry-over from prior months that's still outstanding."
  );
  bullet(
    "Current Month — Every order shipped in the selected month. Shows both paid and " +
      "withheld items with customer, ship date, invoice #, net sales, and commission. " +
      "Sorted alphabetically by customer, then oldest to newest for customers with multiple orders."
  );
  bullet(
    "All Withheld — Every invoice with a commission still outstanding, regardless of ship date. " +
      "Mix of current-month unpaid orders and older carry-over (marked 'Prior' in the Period column)."
  );
  bullet(
    "Read Me — This page. Definitions and conventions for anyone reviewing the report."
  );

  spacer();

  section("  KEY TERMS");
  bullet(
    "Net Sales — Sale line items plus any discounts (percentage and amount). " +
      "Does not include freight, tax, displays, or testers."
  );
  bullet(
    "Commission Rate — Your agency's negotiated rate, applied to Net Sales. Shown on the " +
      "Summary tab and in the Rate column on every detail row."
  );
  bullet(
    "Paid — The commission has already been paid out to your rep group."
  );
  bullet(
    "Withheld — The commission is owed but hasn't been paid yet. This typically happens " +
      "when the customer has not paid their AR invoice to Natural Inspirations."
  );
  bullet(
    "Current / Prior — On the All Withheld tab, 'Current' means the order shipped in this " +
      "month's reporting period. 'Prior' means the order shipped in an earlier month and is still waiting on payment."
  );

  spacer();

  section("  COMMISSION CALCULATION");
  paragraph(
    "Commission = Net Sales × Commission Rate. " +
      "This is calculated per invoice and summed on the detail sheets."
  );
  paragraph(
    "Example: A $1,000 net-sales invoice at a 15% rate produces a $150 commission."
  );

  spacer();

  section("  CARRY-OVER EXPLAINED");
  paragraph(
    "If an invoice from a prior month is still unpaid, it rolls forward onto this month's " +
      "report as carry-over. It stays on the All Withheld tab until it's marked paid. " +
      "This ensures nothing falls off the books."
  );

  spacer();

  section("  QUESTIONS");
  paragraph(
    "If anything looks off — an invoice you didn't expect, a rep name that's wrong, a " +
      "number that doesn't match — reply to the email this report was attached to and we'll investigate."
  );

  autoFit(ws, { min: 4, max: 110, padding: 2 });
  // Ensure column B (content) is wide enough
  ws.getColumn(2).width = 100;
}

/* ════════════════════════════════════════════════════════════
   PER-AGENCY WORKBOOK
   ════════════════════════════════════════════════════════════ */

async function buildAgencyWorkbook(
  agency: PayoutAgency,
  periodLabel: string
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Natural Inspirations";
  wb.created = new Date();
  wb.company = "Natural Inspirations";
  wb.title = `Commission Payout — ${agency.displayName}`;

  // 1. Summary
  buildSummarySheet(wb, agency, periodLabel);

  // 2. Current Month — all orders shipped in the period, paid + unpaid
  const currentMonthOrders = agency.orders.filter(
    (o) => o.period === "current"
  );
  buildDetailSheet(
    wb,
    "current_month",
    agency,
    currentMonthOrders,
    periodLabel
  );

  // 3. All Withheld — every unpaid invoice (current + carryover)
  const withheldOrders = agency.orders.filter((o) => !o.commission_paid);
  buildDetailSheet(wb, "withheld", agency, withheldOrders, periodLabel);

  // 4. Read Me
  buildReadMeSheet(wb, agency);

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/* ════════════════════════════════════════════════════════════
   MASTER SUMMARY WORKBOOK
   ════════════════════════════════════════════════════════════ */

async function buildMasterSummary(
  agencies: PayoutAgency[],
  periodLabel: string
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Natural Inspirations";
  wb.created = new Date();
  wb.company = "Natural Inspirations";
  wb.title = `Commission Payout Summary — ${periodLabel}`;

  const ws = wb.addWorksheet("Payout Summary", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });

  const colCount = 10;
  ws.columns = Array.from({ length: colCount }, () => ({ width: 14 }));

  ws.mergeCells(1, 1, 1, colCount);
  companyHeader(ws.getCell(1, 1), "Natural Inspirations");
  ws.getRow(1).height = 18;

  ws.mergeCells(2, 1, 2, colCount);
  reportTitle(ws.getCell(2, 1), "Commission Payout Summary");
  ws.getRow(2).height = 26;

  ws.mergeCells(3, 1, 3, colCount);
  reportSubtitle(ws.getCell(3, 1), periodLabel);

  ws.mergeCells(4, 1, 4, colCount);
  reportSubtitle(
    ws.getCell(4, 1),
    `${agencies.length} rep group${
      agencies.length === 1 ? "" : "s"
    }  |  Generated ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`
  );

  const headers = [
    "Code",
    "Rep Group",
    "Rate",
    "Orders",
    "Net Sales",
    "This Month",
    "Paid",
    "Withheld",
    "Carry-over",
    "Total Due",
  ];
  const headerRow = ws.addRow(headers);
  for (let c = 1; c <= colCount; c++) {
    const cell = headerRow.getCell(c);
    headerCellStyle(cell);
    if (c >= 3) {
      cell.alignment = {
        horizontal: "right",
        vertical: "middle",
        indent: 1,
      };
    }
  }
  applyBorders(headerRow, colCount, "header");
  headerRow.height = 22;

  let tOrders = 0;
  let tNetSales = 0;
  let tThisMonth = 0;
  let tPaid = 0;
  let tWithheld = 0;
  let tCarryover = 0;
  let tDue = 0;

  const sorted = [...agencies].sort(
    (a, b) => b.totalOwedAndPaid - a.totalOwedAndPaid
  );

  sorted.forEach((agency, idx) => {
    const row = ws.addRow([
      agency.code,
      agency.displayName,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    textCell(row.getCell(1), agency.code, true);
    textCell(row.getCell(2), agency.displayName);
    percentCell(row.getCell(3), agency.rate);
    intCell(row.getCell(4), agency.currentOrderCount);
    moneyCell(row.getCell(5), agency.currentNetSales);
    moneyCell(row.getCell(6), agency.currentCommissions);
    moneyCell(row.getCell(7), agency.currentPaidCommissions);
    moneyCell(row.getCell(8), agency.currentWithheldCommissions);
    moneyCell(row.getCell(9), agency.carryoverCommissions);
    moneyCell(row.getCell(10), agency.totalOwedAndPaid, true);

    if (agency.currentWithheldCommissions > 0) {
      row.getCell(8).font = {
        name: FONT,
        size: 10,
        color: { argb: NEGATIVE },
      };
    }
    if (agency.carryoverCommissions > 0) {
      row.getCell(9).font = {
        name: FONT,
        size: 10,
        color: { argb: NEGATIVE },
      };
    }
    if (agency.currentPaidCommissions > 0) {
      row.getCell(7).font = {
        name: FONT,
        size: 10,
        color: { argb: POSITIVE },
      };
    }

    if (idx % 2 === 0) {
      for (let c = 1; c <= colCount; c++) {
        row.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GRAY_LIGHT },
        };
      }
    }

    applyBorders(row, colCount, "data");

    tOrders += agency.currentOrderCount;
    tNetSales += agency.currentNetSales;
    tThisMonth += agency.currentCommissions;
    tPaid += agency.currentPaidCommissions;
    tWithheld += agency.currentWithheldCommissions;
    tCarryover += agency.carryoverCommissions;
    tDue += agency.totalOwedAndPaid;
  });

  const totalRow = ws.addRow([
    "",
    "TOTAL",
    "",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  for (let c = 1; c <= colCount; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRAY_HEADER },
    };
    cell.font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: TEXT_BLACK },
    };
  }
  totalRow.getCell(2).alignment = {
    horizontal: "left",
    vertical: "middle",
    indent: 1,
  };
  totalRow.getCell(4).value = tOrders;
  totalRow.getCell(4).numFmt = "#,##0";
  totalRow.getCell(4).alignment = {
    horizontal: "right",
    vertical: "middle",
    indent: 1,
  };
  for (let c = 5; c <= colCount; c++) {
    totalRow.getCell(c).alignment = {
      horizontal: "right",
      vertical: "middle",
      indent: 1,
    };
    totalRow.getCell(c).numFmt = '"$"#,##0.00';
  }
  totalRow.getCell(5).value = tNetSales;
  totalRow.getCell(6).value = tThisMonth;
  totalRow.getCell(7).value = tPaid;
  if (tPaid > 0) {
    totalRow.getCell(7).font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: POSITIVE },
    };
  }
  totalRow.getCell(8).value = tWithheld;
  if (tWithheld > 0) {
    totalRow.getCell(8).font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: NEGATIVE },
    };
  }
  totalRow.getCell(9).value = tCarryover;
  if (tCarryover > 0) {
    totalRow.getCell(9).font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: NEGATIVE },
    };
  }
  totalRow.getCell(10).value = tDue;
  applyBorders(totalRow, colCount, "total");
  totalRow.height = 26;

  autoFit(ws, { min: 12, max: 42, padding: 3 });

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

/* ════════════════════════════════════════════════════════════
   TOP-LEVEL EXPORTS
   ════════════════════════════════════════════════════════════ */

function safeFileName(name: string): string {
  return name
    .replace(/[^a-z0-9\-_ ]+/gi, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Generate a single polished xlsx workbook for one rep group.
 * Returns a Blob ready to download.
 */
export async function generateSingleAgencyWorkbook(
  agency: PayoutAgency,
  year: number,
  month: number
): Promise<{ blob: Blob; filename: string }> {
  const periodLabel = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const buf = await buildAgencyWorkbook(agency, periodLabel);
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filename = `${agency.code}_${safeFileName(
    agency.displayName
  )}_${year}-${String(month).padStart(2, "0")}.xlsx`;
  return { blob, filename };
}

export async function generatePayoutPacketZip(
  agencies: PayoutAgency[],
  year: number,
  month: number
): Promise<Blob> {
  const periodLabel = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const zip = new JSZip();

  for (const agency of agencies) {
    if (agency.orders.length === 0) continue;
    const buf = await buildAgencyWorkbook(agency, periodLabel);
    const fname = `${agency.code}_${safeFileName(agency.displayName)}.xlsx`;
    zip.file(fname, buf);
  }

  const summaryBuf = await buildMasterSummary(agencies, periodLabel);
  zip.file("_Master_Summary.xlsx", summaryBuf);

  return zip.generateAsync({ type: "blob" });
}
