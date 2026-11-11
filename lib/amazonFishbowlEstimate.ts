/**
 * An Amazon settlement → the Fishbowl ESTIMATE that books it (always an
 * estimate, never a sales order — a person converts it). Pure mapping; the
 * push itself is pushAmazonEstimate() in lib/amazonSettlementStore.ts, which
 * posts these rows through createEstimate() in lib/fishbowl.ts.
 *
 * It reproduces the order ops has been keying by hand for every settlement
 * (spec per Blake, 2026-11-11; matches hand-keyed SO 25400):
 *  - customer AMAZON - CUSTOMER, Customer PO = the settlement period
 *    ("10/08-10/22/2026"), location group Amazon Warehouse (relieves FBA stock);
 *  - one line per SKU at units × unit price, so the total = the entry's Sales;
 *  - CF Order Agency NI HOUSE / Order Rep NOT REP ASSIGNED / Order Source
 *    AMAZON / Order Agency Code 100, salesman NI HOUSE;
 *  - the note carries the rest of the journal entry (shipping, fees, …, net),
 *    as the hand-keyed notes did.
 */

import { JE_COLUMNS, JE_COLUMN_LABELS, type SettlementJournalEntry } from "./amazonSettlement";
import { ESTIMATE_STATUS, SALES_ORDER_IMPORT_HEADER } from "./fishbowlEstimate";

export const AMAZON_FISHBOWL_CUSTOMER = "AMAZON - CUSTOMER";

/** "10/08-10/22/2026" — the Customer PO for a settlement period (parseAmazonPoPeriod reads it back). */
export function amazonPoNum(je: Pick<SettlementJournalEntry, "startDate" | "endDate">): string {
  const md = (ymd: string) => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}`;
  return `${md(je.startDate)}-${md(je.endDate)}/${je.endDate.slice(0, 4)}`;
}

export type AmazonEstimateLine = { sku: string; quantity: number; unitPrice: number; total: number };

/**
 * The sale lines, straight from the settlement file: Order › ItemPrice ›
 * Principal lines grouped by SKU and unit price (amount ÷ quantity-purchased).
 * A SKU sold at two prices in one period becomes two lines, so the estimate
 * total equals Sales to the cent — averaging would not.
 */
export function amazonEstimateLines(fileText: string): AmazonEstimateLine[] {
  const rows = fileText
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((r) => r.split("\t"));
  const h = (rows[0] ?? []).map((c) => c.trim().toLowerCase());
  const col = (name: string) => h.indexOf(name);
  const [iTt, iAt, iAd, iAmt, iSku, iQty] = [
    "transaction-type",
    "amount-type",
    "amount-description",
    "amount",
    "sku",
    "quantity-purchased",
  ].map(col);
  if ([iTt, iAt, iAd, iAmt, iSku, iQty].some((i) => i < 0)) {
    throw new Error("The settlement file is missing the columns needed for quantities (sku / quantity-purchased).");
  }
  const lines = new Map<string, { sku: string; quantity: number; cents: number; unitCents: number }>();
  for (const r of rows.slice(1)) {
    const cell = (i: number) => (r[i] ?? "").trim();
    if (
      cell(iTt).toLowerCase() !== "order" ||
      cell(iAt).toLowerCase() !== "itemprice" ||
      cell(iAd).toLowerCase() !== "principal"
    )
      continue;
    const sku = cell(iSku);
    const qty = Number(cell(iQty)) || 0;
    const cents = Math.round(Number(cell(iAmt).replace(/,/g, "")) * 100);
    if (!sku || qty <= 0 || !Number.isFinite(cents)) continue;
    if (cents % qty !== 0) {
      throw new Error(`${sku}: $${(cents / 100).toFixed(2)} for ${qty} units isn't a whole-cent unit price.`);
    }
    const unitCents = cents / qty;
    const key = `${sku}\u0000${unitCents}`;
    const l = lines.get(key) ?? { sku, quantity: 0, cents: 0, unitCents };
    l.quantity += qty;
    l.cents += cents;
    lines.set(key, l);
  }
  return [...lines.values()]
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }) || b.unitCents - a.unitCents)
    .map((l) => ({ sku: l.sku, quantity: l.quantity, unitPrice: l.unitCents / 100, total: l.cents / 100 }));
}

const money = (n: number) => (n < 0 ? `($${Math.abs(n).toFixed(2)})` : `$${n.toFixed(2)}`);

/** The SO note: every journal-entry column except Sales (that's the lines), then the net deposit. */
export function amazonEstimateNote(je: Pick<SettlementJournalEntry, "columns" | "total" | "label">): string {
  return [
    `AMAZON SETTLEMENT ${je.label}`,
    ...JE_COLUMNS.filter((c) => c !== "sales" && je.columns[c] !== 0).map(
      (c) => `AMAZON ${JE_COLUMN_LABELS[c].toUpperCase().replace(/^AMAZON /, "")}: ${money(je.columns[c])}`,
    ),
    `AMAZON NET: ${money(je.total)}`,
  ].join("\n");
}

/**
 * The SalesOrderDetails import rows (header first) for createEstimate().
 * `today` is MM/DD/YYYY. Throws if the lines don't add up to the entry's Sales.
 */
export function amazonEstimateRows(
  je: Pick<SettlementJournalEntry, "startDate" | "endDate" | "columns" | "total" | "label">,
  lines: AmazonEstimateLine[],
  today: string,
): { poNum: string; rows: string[][] } {
  if (!lines.length) throw new Error("No sale lines in this settlement.");
  const linesCents = lines.reduce((s, l) => s + Math.round(l.total * 100), 0);
  if (linesCents !== Math.round(je.columns.sales * 100)) {
    throw new Error(
      `The lines total $${(linesCents / 100).toFixed(2)} but the entry's Sales is $${je.columns.sales.toFixed(2)} — not pushing a mismatched estimate.`,
    );
  }
  const poNum = amazonPoNum(je);
  type Col = (typeof SALES_ORDER_IMPORT_HEADER)[number];
  const header: Partial<Record<Col, string>> = {
    SONum: "",
    Status: ESTIMATE_STATUS,
    CustomerName: AMAZON_FISHBOWL_CUSTOMER,
    CustomerContact: AMAZON_FISHBOWL_CUSTOMER,
    BillToName: AMAZON_FISHBOWL_CUSTOMER,
    BillToAddress: "N/A",
    BillToCity: "N/A",
    BillToCountry: "UNITED STATES",
    ShipToName: AMAZON_FISHBOWL_CUSTOMER,
    ShipToAddress: "N/A",
    ShipToCity: "N/A",
    ShipToCountry: "UNITED STATES",
    ShipToResidential: "false",
    CarrierName: "AMAZ",
    TaxRateName: "None",
    PriorityId: "30",
    PONum: poNum,
    Date: today,
    Salesman: "NI HOUSE",
    ShippingTerms: "Prepaid & Billed",
    PaymentTerms: "DUE UPON RECEIPT",
    FOB: "Origin",
    Note: amazonEstimateNote(je),
    QuickBooksClassName: "None",
    LocationGroupName: "Amazon Warehouse",
    OrderDateScheduled: today,
    "CF-Territory Agency": "NI HOUSE",
    "CF-Territory Code": "100",
    "CF-Territory Sales Rep Name": "NA",
    "CF-Order Agency": "NI HOUSE",
    "CF-Order Rep": "NOT REP ASSIGNED",
    "CF-Order Source": "AMAZON",
    "CF-Order Agency Code": "100",
  };
  const toRow = (v: Partial<Record<Col, string>>) => SALES_ORDER_IMPORT_HEADER.map((c) => v[c] ?? "");
  return {
    poNum,
    rows: [
      [...SALES_ORDER_IMPORT_HEADER],
      ...lines.map((l) =>
        toRow({
          ...header,
          SOItemTypeID: "10",
          ProductNumber: l.sku,
          ProductQuantity: String(l.quantity),
          UOM: "ea",
          ProductPrice: l.unitPrice.toFixed(2),
          Taxable: "false",
          ItemQuickBooksClassName: "None",
          ItemDateScheduled: today,
          ShowItem: "true",
          KitItem: "false",
        }),
      ),
    ],
  };
}
