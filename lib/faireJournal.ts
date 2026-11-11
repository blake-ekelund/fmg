/**
 * Faire journal entries: one entry covering one or more Faire payouts, with
 * debit/credit lines against FMG's chart of accounts. Pure — the store saves a
 * snapshot (lib/faireJournalStore.ts), the pages render it, and the .xlsx is
 * built from it (lib/faireJournalXlsx.ts).
 *
 * Account mapping: suggested from the chart on Accounting → Chart of Accounts
 * (accounts that exist in both the current QBD and the proposed QBO chart).
 * The CPA should confirm SALES in particular — if Fishbowl already books Faire
 * orders as invoices (Ship → Invoice under each retailer), the credit belongs
 * on the receivable the invoices created, not on Gross Sales again.
 */

import { FAIRE_JE_COLUMNS, FAIRE_JE_LABELS, type FaireJeColumn, type FairePayout } from "./fairePayouts";

export type JeAccount = { number: string | null; name: string };

/** Where each payout column books. Positive column = money in. */
export const FAIRE_JE_ACCOUNTS: Record<FaireJeColumn | "net", JeAccount> = {
  net: { number: "10000", name: "BMO - Checking - 9664" },
  grossSales: { number: "40000", name: "Gross Sales" },
  brandDiscounts: { number: "41300", name: "Deductions:Discounts - Product" },
  commission: { number: "60030", name: "Commissions:Faire Commissions" },
  processingFees: { number: "65210", name: "Credit Card Fees:Faire Pmnt Process Fee" },
  shippingReimbursed: { number: "40300", name: "Gross Sales:Freight Revenue" },
  shippingSubsidy: { number: "42500", name: "Deductions:Discounts - Faire Shipping" },
  other: { number: null, name: "Faire adjustments — choose an account" },
};

/** "FAIRE-JE-0001" from the entry's sequence number. */
export const jeNumber = (seq: number) => `FAIRE-JE-${String(seq).padStart(4, "0")}`;

export const accountLabel = (a: JeAccount) => (a.number ? `${a.number} ${a.name}` : a.name);

export type JeLine = {
  key: FaireJeColumn | "net";
  account: JeAccount;
  description: string;
  debit: number;
  credit: number;
};

/**
 * Debit/credit lines for a set of column totals. The deposit is a debit to the
 * bank; each column is a credit when it brought money in (sales, shipping
 * reimbursed) and a debit when it took money out (commission, fees, discounts,
 * subsidy). Zero lines are dropped. Debits always equal credits because the
 * columns sum to the net.
 */
export function journalLines(columns: Record<FaireJeColumn, number>, net: number): JeLine[] {
  const lines: JeLine[] = [];
  const push = (key: FaireJeColumn | "net", description: string, amount: number) => {
    const cents = Math.round(amount * 100);
    if (!cents) return;
    // The deposit debits the bank; a column that brought money in credits, one that took it out debits.
    const asDebit = key === "net" ? cents > 0 : cents < 0;
    const abs = Math.abs(cents) / 100;
    lines.push({
      key,
      account: FAIRE_JE_ACCOUNTS[key],
      description,
      debit: asDebit ? abs : 0,
      credit: asDebit ? 0 : abs,
    });
  };
  push("net", "Faire deposit", net);
  for (const c of FAIRE_JE_COLUMNS) push(c, `Faire ${FAIRE_JE_LABELS[c].toLowerCase().replace(/^faire /, "")}`, columns[c]);
  return lines;
}

/** A saved journal entry (faire_journal_entries), with the payouts it covers snapshotted. */
export type FaireJournalEntry = {
  id: string;
  /** "FAIRE-JE-0001". */
  number: string;
  /** The entry's date — the latest payout it covers (YYYY-MM-DD). */
  date: string;
  memo: string;
  createdAt: string;
  createdBy: string | null;
  qboEnteredAt: string | null;
  qboEnteredBy: string | null;
  payoutDates: string[];
  columns: Record<FaireJeColumn, number>;
  net: number;
  lines: JeLine[];
  /** Snapshot of the payouts (with their orders) at the time the entry was made. */
  payouts: FairePayout[];
};

/** Totals across payouts → the entry's columns, net, memo, date and lines. */
export function buildJournalEntry(payouts: FairePayout[]): Pick<FaireJournalEntry, "date" | "memo" | "payoutDates" | "columns" | "net" | "lines"> {
  if (!payouts.length) throw new Error("Select at least one payout.");
  const dates = payouts.map((p) => p.date).sort();
  const cents = Object.fromEntries(FAIRE_JE_COLUMNS.map((c) => [c, 0])) as Record<FaireJeColumn, number>;
  let netCents = 0;
  for (const p of payouts) {
    for (const c of FAIRE_JE_COLUMNS) cents[c] += Math.round(p.columns[c] * 100);
    netCents += Math.round(p.net * 100);
  }
  const columns = Object.fromEntries(FAIRE_JE_COLUMNS.map((c) => [c, cents[c] / 100])) as Record<FaireJeColumn, number>;
  const net = netCents / 100;
  const orders = payouts.reduce((s, p) => s + p.orders.length, 0);
  const span = dates.length === 1 ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`;
  return {
    date: dates[dates.length - 1],
    memo: `Faire payouts ${span} — ${dates.length} payout${dates.length === 1 ? "" : "s"}, ${orders} order${orders === 1 ? "" : "s"}`,
    payoutDates: dates,
    columns,
    net,
    lines: journalLines(columns, net),
  };
}

export const jeTotals = (lines: JeLine[]) => ({
  debit: lines.reduce((s, l) => s + Math.round(l.debit * 100), 0) / 100,
  credit: lines.reduce((s, l) => s + Math.round(l.credit * 100), 0) / 100,
});
