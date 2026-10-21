/**
 * Amazon settlement report (the tab-separated "Flat File V2" from Seller
 * Central → Payments → Reports Repository) → the one-row journal entry the
 * books take per settlement period.
 *
 * Every line is bucketed into exactly one column and anything we don't
 * recognise falls into "Other", so the columns always add up to the deposit
 * Amazon actually made. `reconciles` is the guard on that.
 *
 * Column rules were reverse-engineered from the bookkeeping sheet:
 *   - Promo Rebates is only the *shipping* promotions; item-price promotions
 *     ride in Other.
 *   - FBA Fees is inbound transportation plus the FBAFees rows (storage,
 *     removal, placement). The sheet dropped the FBAFees rows from every
 *     column, so its columns came up short of its own total.
 *   - Refunded Sales is every Refund line (principal, tax, and the fee
 *     give-backs), net.
 *   - Tax collected and the matching marketplace-facilitator withholding net
 *     to zero and land in Other.
 */

export const JE_COLUMNS = [
  "sales",
  "shipping",
  "amazonFees",
  "advertising",
  "promoRebates",
  "fbaFees",
  "refundedSales",
  "other",
] as const;

export type JeColumn = (typeof JE_COLUMNS)[number];

export const JE_COLUMN_LABELS: Record<JeColumn, string> = {
  sales: "Sales",
  shipping: "Shipping",
  amazonFees: "Amazon Fees",
  advertising: "Cost of Advertising",
  promoRebates: "Promo Rebates",
  fbaFees: "FBA Fees",
  refundedSales: "Refunded Sales",
  other: "Other",
};

/** One distinct (transaction type, amount type, description) and what it summed to. */
export type SettlementLineGroup = {
  column: JeColumn;
  transactionType: string;
  amountType: string;
  amountDescription: string;
  count: number;
  /** In cents, to keep the sums exact. */
  cents: number;
};

export type SettlementJournalEntry = {
  settlementId: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  depositDate: string;
  currency: string;
  /** "09/24/2026 to 10/08/2026" */
  label: string;
  columns: Record<JeColumn, number>;
  /** Sum of the columns. */
  total: number;
  /** The total-amount Amazon printed on the report (what hit the bank). */
  reportedTotal: number | null;
  reconciles: boolean;
  groups: SettlementLineGroup[];
  lineCount: number;
};

/** A journal entry as stored in amazon_settlements (id null = not saved). */
export type SavedSettlement = SettlementJournalEntry & {
  id: string | null;
  fileName: string | null;
  createdAt: string | null;
};

/** amazon_settlements column for each JE column. */
export const JE_DB_COLUMNS: Record<JeColumn, string> = {
  sales: "sales",
  shipping: "shipping",
  amazonFees: "amazon_fees",
  advertising: "advertising",
  promoRebates: "promo_rebates",
  fbaFees: "fba_fees",
  refundedSales: "refunded_sales",
  other: "other",
};

export function classifyLine(
  transactionType: string,
  amountType: string,
  amountDescription: string
): JeColumn {
  const tt = transactionType.trim().toLowerCase();
  const at = amountType.trim().toLowerCase();
  const ad = amountDescription.trim().toLowerCase();

  if (tt === "refund") return "refundedSales";

  if (at === "itemprice") {
    if (ad === "principal") return "sales";
    if (ad === "shipping") return "shipping";
    return "other"; // Tax / ShippingTax / GiftWrap… — tax nets out against ItemWithheldTax
  }
  if (at === "itemfees") return "amazonFees";
  if (at === "cost of advertising") return "advertising";
  if (at === "promotion" && ad === "shipping") return "promoRebates";
  if (tt === "fbafees") return "fbaFees";
  if (ad === "inbound transportation fee") return "fbaFees";
  return "other";
}

const toCents = (raw: string): number => {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${m}/${d}/${y}` : ymd;
};

export class SettlementParseError extends Error {}

export function parseSettlementReport(text: string): SettlementJournalEntry {
  const rows = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((r) => r.trim() !== "")
    .map((r) => r.split("\t"));

  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const iId = col("settlement-id");
  const iStart = col("settlement-start-date");
  const iEnd = col("settlement-end-date");
  const iDeposit = col("deposit-date");
  const iTotal = col("total-amount");
  const iCurrency = col("currency");
  const iTt = col("transaction-type");
  const iAt = col("amount-type");
  const iAd = col("amount-description");
  const iAmt = col("amount");
  if ([iId, iTt, iAt, iAd, iAmt].some((i) => i < 0)) {
    throw new SettlementParseError(
      "This doesn't look like an Amazon settlement report — expected the tab-separated flat file with settlement-id, transaction-type, amount-type, amount-description and amount columns."
    );
  }

  let settlementId = "";
  let startDate = "";
  let endDate = "";
  let depositDate = "";
  let currency = "USD";
  let reportedCents: number | null = null;
  const groups = new Map<string, SettlementLineGroup>();
  let lineCount = 0;

  for (const r of rows.slice(1)) {
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    if (!settlementId) settlementId = cell(iId);

    // The summary row: totals + period, no transaction.
    if (!cell(iTt) && cell(iTotal)) {
      startDate = cell(iStart).slice(0, 10);
      endDate = cell(iEnd).slice(0, 10);
      depositDate = cell(iDeposit).slice(0, 10);
      currency = cell(iCurrency) || currency;
      reportedCents = toCents(cell(iTotal));
      continue;
    }
    if (!cell(iAmt)) continue;

    const tt = cell(iTt);
    const at = cell(iAt);
    const ad = cell(iAd);
    const key = `${tt}\u0000${at}\u0000${ad}`;
    const g = groups.get(key) ?? {
      column: classifyLine(tt, at, ad),
      transactionType: tt,
      amountType: at,
      amountDescription: ad,
      count: 0,
      cents: 0,
    };
    g.count++;
    g.cents += toCents(cell(iAmt));
    groups.set(key, g);
    lineCount++;
  }

  if (lineCount === 0) {
    throw new SettlementParseError("The report has no transaction lines.");
  }

  const cents = Object.fromEntries(JE_COLUMNS.map((c) => [c, 0])) as Record<JeColumn, number>;
  for (const g of groups.values()) cents[g.column] += g.cents;
  const totalCents = JE_COLUMNS.reduce((s, c) => s + cents[c], 0);

  return {
    settlementId,
    startDate,
    endDate,
    depositDate,
    currency,
    label: startDate && endDate ? `${fmtDate(startDate)} to ${fmtDate(endDate)}` : settlementId,
    columns: Object.fromEntries(JE_COLUMNS.map((c) => [c, cents[c] / 100])) as Record<JeColumn, number>,
    total: totalCents / 100,
    reportedTotal: reportedCents === null ? null : reportedCents / 100,
    reconciles: reportedCents === null || reportedCents === totalCents,
    groups: [...groups.values()].sort(
      (a, b) => JE_COLUMNS.indexOf(a.column) - JE_COLUMNS.indexOf(b.column) || a.cents - b.cents
    ),
    lineCount,
  };
}
