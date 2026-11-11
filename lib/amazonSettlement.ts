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

/** One distinct (SKU, transaction type, amount type, description) and what it summed to. */
export type SettlementLineGroup = {
  column: JeColumn;
  /** The line's SKU; "" for settlement-level lines (advertising, storage, inbound…).
   *  Absent on entries saved before SKUs were kept — re-upload to get them. */
  sku?: string;
  transactionType: string;
  amountType: string;
  amountDescription: string;
  count: number;
  /** In cents, to keep the sums exact. */
  cents: number;
  /** Units sold — only on Order › ItemPrice › Principal groups (every line of an
   *  order item repeats its quantity, so only one line type can count it). */
  units?: number;
};

const isUnitLine = (tt: string, at: string, ad: string) =>
  tt.toLowerCase() === "order" && at.toLowerCase() === "itemprice" && ad.toLowerCase() === "principal";

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
  /** SKU → catalog description, for the by-SKU table (missing = not in the catalog). */
  skuNames?: Record<string, string>;
  /** Who uploaded the file (first name from profiles); null if unknown. */
  uploadedBy?: string | null;
  /** The Fishbowl sales order this settlement was keyed as; null = not found. */
  fishbowl?: FishbowlAmazonOrder | null;
  /** The original uploaded file is kept and can be downloaded. */
  hasFile?: boolean;
};

/**
 * A hand-keyed Fishbowl sales order for customer "AMAZON - CUSTOMER": one per
 * settlement, Customer PO = the period ("9/24-10/8/2026"), one line per SKU at
 * units × price (so its total = the Sales column), shipped from Amazon Warehouse.
 */
export type FishbowlAmazonOrder = {
  num: string;
  status: string;
  customerPO: string;
  total: number;
  /** Part → units on the order (priced lines only; $0 kit components are left out). */
  units: Record<string, number>;
  /** Part → dollars on the order (same lines). */
  amounts?: Record<string, number>;
};

/** One SKU where the Fishbowl order and the settlement file disagree. */
export type FishbowlLineDiff = {
  sku: string;
  amazonUnits: number;
  fishbowlUnits: number;
  amazonSales: number;
  fishbowlAmount: number | null;
  /** Plain-words reason for this one line. */
  explanation: string;
};

export type FishbowlComparison =
  | { state: "missing" }
  | {
      state: "ok" | "mismatch";
      num: string;
      status: string;
      /** Fishbowl order total minus the entry's Sales (0 = ties). */
      totalDiff: number;
      /** Lines that differ; null when the entry has no units (saved before they were kept). */
      diffs: FishbowlLineDiff[] | null;
      /** Plain-words summary of what probably happened, most likely cause first. */
      explanation: string[];
    };

const usd = (n: number) => `$${Math.abs(n).toFixed(2)}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Compare a settlement with the Fishbowl sales order it was hand-keyed as,
 * SKU by SKU (units and dollars), and say in plain words what probably went
 * wrong. The usual mistake is keying units on the wrong SKU: the order total
 * still ties, but Fishbowl's inventory is off for both parts.
 */
export function compareWithFishbowl(je: Pick<SettlementJournalEntry, "groups" | "columns"> & {
  fishbowl?: FishbowlAmazonOrder | null;
}): FishbowlComparison {
  const fb = je.fishbowl;
  if (!fb) return { state: "missing" };
  const totalDiff = Math.round((fb.total - je.columns.sales) * 100) / 100;
  const { rows } = summarizeBySku(je.groups);
  const explanation: string[] = [];

  if (!rows.length || rows[0].units === null) {
    if (totalDiff !== 0)
      explanation.push(
        `The order total is ${usd(totalDiff)} ${totalDiff > 0 ? "more" : "less"} than Sales. Upload the settlement file again to see which SKU it's on.`,
      );
    return { state: totalDiff === 0 ? "ok" : "mismatch", num: fb.num, status: fb.status, totalDiff, diffs: null, explanation };
  }

  const amazon = new Map(rows.map((r) => [r.sku, r]));
  const parts = [...new Set([...rows.filter((r) => r.units || r.columns.sales).map((r) => r.sku), ...Object.keys(fb.units)])];
  const diffs: FishbowlLineDiff[] = [];
  for (const sku of parts.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const a = amazon.get(sku);
    const amazonUnits = a?.units ?? 0;
    const amazonSales = a?.columns.sales ?? 0;
    const fishbowlUnits = fb.units[sku] ?? 0;
    const fishbowlAmount = fb.amounts ? Math.round((fb.amounts[sku] ?? 0) * 100) / 100 : null;
    const unitsOff = amazonUnits !== fishbowlUnits;
    const dollarsOff = fishbowlAmount !== null && Math.abs(fishbowlAmount - amazonSales) >= 0.005;
    if (!unitsOff && !dollarsOff) continue;

    let why: string;
    if (!fishbowlUnits) why = `Amazon sold ${plural(amazonUnits, "unit")} (${usd(amazonSales)}) but it isn't on the Fishbowl order.`;
    else if (!amazonUnits)
      why = `Keyed ${plural(fishbowlUnits, "unit")} in Fishbowl, but Amazon sold none of this SKU in this settlement.`;
    else if (unitsOff) why = `Keyed ${fishbowlUnits}, Amazon sold ${amazonUnits}.`;
    else
      why = `Units match (${amazonUnits}) but the line is ${usd(fishbowlAmount ?? 0)} vs Amazon's ${usd(amazonSales)} — the price on the Fishbowl line differs.`;
    diffs.push({ sku, amazonUnits, fishbowlUnits, amazonSales, fishbowlAmount, explanation: why });
  }

  const over = diffs.filter((d) => d.fishbowlUnits > d.amazonUnits);
  const under = diffs.filter((d) => d.fishbowlUnits < d.amazonUnits);
  const lineDollars = (d: FishbowlLineDiff) => (d.fishbowlAmount ?? 0) - d.amazonSales;
  const netLines = Math.round(diffs.reduce((s, d) => s + lineDollars(d), 0) * 100) / 100;

  if (over.length && under.length && totalDiff === 0 && netLines === 0) {
    explanation.push(
      `Units were most likely keyed on the wrong SKU: the order total still matches because the extra ${over
        .map((d) => `${d.sku} (+${d.fishbowlUnits - d.amazonUnits}, ${usd(lineDollars(d))})`)
        .join(", ")} cost the same as the missing ${under
        .map((d) => `${d.sku} (−${d.amazonUnits - d.fishbowlUnits}, ${usd(lineDollars(d))})`)
        .join(", ")}.`,
    );
  } else if (diffs.length && totalDiff === 0) {
    explanation.push("The order total matches Sales, but the lines below don't — the differences cancel out in dollars.");
  } else if (totalDiff !== 0) {
    explanation.push(
      `The order total is ${usd(totalDiff)} ${totalDiff > 0 ? "more" : "less"} than Sales${
        diffs.length ? "; the lines below account for it" : ""
      }.`,
    );
  }
  if (over.length || under.length)
    explanation.push(
      `Fishbowl inventory is off until the order is corrected: ${[
        ...over.map((d) => `${d.sku} is ${d.fishbowlUnits - d.amazonUnits} lower than it should be`),
        ...under.map((d) => `${d.sku} is ${d.amazonUnits - d.fishbowlUnits} higher`),
      ].join("; ")}.`,
    );

  return {
    state: totalDiff === 0 && !diffs.length ? "ok" : "mismatch",
    num: fb.num,
    status: fb.status,
    totalDiff,
    diffs,
    explanation,
  };
}

/**
 * "9/24-10/8/2026" / "12/18-1/1/2026" / "03/12-03/26/2026" → ISO start/end.
 * The year is only on the end date; a start month after the end month is the
 * year before.
 */
export function parseAmazonPoPeriod(po: string): { start: string; end: string } | null {
  const m = po.trim().match(/^(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [sm, sd, em, ed, y] = m.slice(1).map(Number);
  const iso = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return { start: iso(sm > em ? y - 1 : y, sm, sd), end: iso(y, em, ed) };
}

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
  const iSku = col("sku");
  const iQty = col("quantity-purchased");
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
    const sku = cell(iSku);
    const key = `${sku}\u0000${tt}\u0000${at}\u0000${ad}`;
    const g = groups.get(key) ?? {
      column: classifyLine(tt, at, ad),
      sku,
      transactionType: tt,
      amountType: at,
      amountDescription: ad,
      count: 0,
      cents: 0,
    };
    g.count++;
    g.cents += toCents(cell(iAmt));
    if (isUnitLine(tt, at, ad)) g.units = (g.units ?? 0) + (Number(cell(iQty)) || 0);
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

/** The groups with SKUs merged away: the by-line-type breakdown. */
export function groupsByType(groups: SettlementLineGroup[]): SettlementLineGroup[] {
  const merged = new Map<string, SettlementLineGroup>();
  for (const g of groups) {
    const key = `${g.transactionType}\u0000${g.amountType}\u0000${g.amountDescription}`;
    const m = merged.get(key) ?? { ...g, sku: undefined, count: 0, cents: 0, units: undefined };
    m.count += g.count;
    m.cents += g.cents;
    if (g.units !== undefined) m.units = (m.units ?? 0) + g.units;
    merged.set(key, m);
  }
  return [...merged.values()].sort(
    (a, b) => JE_COLUMNS.indexOf(a.column) - JE_COLUMNS.indexOf(b.column) || a.cents - b.cents
  );
}

/** One product's share of a settlement, in the journal-entry columns. */
export type SkuSummary = {
  sku: string;
  /** Units sold (null on entries saved before units were kept). */
  units: number | null;
  columns: Record<JeColumn, number>;
  total: number;
};

/**
 * The entry by SKU (Amazon Data by SKU). Lines with no SKU — advertising,
 * storage, inbound, subscription — land in `unassigned`, so the SKU rows plus
 * it always add back to the entry. `hasSkus` is false for entries saved
 * before SKUs were kept.
 */
export function summarizeBySku(groups: SettlementLineGroup[]): {
  hasSkus: boolean;
  rows: SkuSummary[];
  unassigned: SkuSummary;
} {
  const cents = new Map<string, Record<JeColumn, number>>();
  const units = new Map<string, number>();
  // Entries saved before units were kept carry no `units` anywhere.
  const hasUnits = groups.some((g) => g.units !== undefined);
  for (const g of groups) {
    const sku = g.sku ?? "";
    const c = cents.get(sku) ?? (Object.fromEntries(JE_COLUMNS.map((k) => [k, 0])) as Record<JeColumn, number>);
    c[g.column] += g.cents;
    cents.set(sku, c);
    if (g.units) units.set(sku, (units.get(sku) ?? 0) + g.units);
  }
  const toSummary = (sku: string, c: Record<JeColumn, number> | undefined): SkuSummary => {
    const cols = Object.fromEntries(JE_COLUMNS.map((k) => [k, (c?.[k] ?? 0) / 100])) as Record<JeColumn, number>;
    return {
      sku,
      units: hasUnits ? units.get(sku) ?? 0 : null,
      columns: cols,
      total: JE_COLUMNS.reduce((s, k) => s + (c?.[k] ?? 0), 0) / 100,
    };
  };
  const rows = [...cents.entries()]
    .filter(([sku]) => sku !== "")
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([sku, c]) => toSummary(sku, c));
  return {
    hasSkus: groups.some((g) => g.sku !== undefined),
    rows,
    unassigned: toSummary("", cents.get("")),
  };
}
