import { describe, it, expect } from "vitest";
import { buildJournalEntry, jeTotals, journalLines } from "../faireJournal";
import type { FairePayout } from "../fairePayouts";

const payout = (date: string, cols: Partial<FairePayout["columns"]>, net: number, orders = 1): FairePayout => ({
  date,
  orders: Array.from({ length: orders }, (_, i) => ({ displayId: `${date}-${i}` })) as FairePayout["orders"],
  columns: {
    grossSales: 0,
    brandDiscounts: 0,
    commission: 0,
    processingFees: 0,
    shippingReimbursed: 0,
    shippingSubsidy: 0,
    other: 0,
    ...cols,
  },
  net,
  units: 0,
});

describe("Faire journal entry", () => {
  it("debits the bank and fees, credits sales and shipping reimbursed, and balances", () => {
    const lines = journalLines(
      { grossSales: 162.17, brandDiscounts: 0, commission: -24.33, processingFees: -4.19, shippingReimbursed: 20.76, shippingSubsidy: 0, other: 0 },
      154.41,
    );
    expect(lines.map((l) => [l.account.number, l.debit, l.credit])).toEqual([
      ["10000", 154.41, 0],
      ["40000", 0, 162.17],
      ["60030", 24.33, 0],
      ["65210", 4.19, 0],
      ["40300", 0, 20.76],
    ]);
    expect(jeTotals(lines)).toEqual({ debit: 182.93, credit: 182.93 });
  });

  it("puts a positive Other on the credit side and a negative one on the debit side", () => {
    const pos = journalLines({ grossSales: 100, brandDiscounts: 0, commission: 0, processingFees: 0, shippingReimbursed: 0, shippingSubsidy: 0, other: 2 }, 102);
    const neg = journalLines({ grossSales: 100, brandDiscounts: 0, commission: 0, processingFees: 0, shippingReimbursed: 0, shippingSubsidy: 0, other: -2 }, 98);
    expect(pos.find((l) => l.key === "other")).toMatchObject({ debit: 0, credit: 2 });
    expect(neg.find((l) => l.key === "other")).toMatchObject({ debit: 2, credit: 0 });
  });

  it("combines several payouts into one balanced entry dated on the latest", () => {
    const je = buildJournalEntry([
      payout("2026-11-06", { grossSales: 1454.22, brandDiscounts: -10.65, commission: -133.35, processingFees: -36.45, shippingReimbursed: 145.36, shippingSubsidy: -63.13 }, 1356.0, 6),
      payout("2026-11-10", { grossSales: 472, processingFees: -12.22, shippingReimbursed: 92.63, shippingSubsidy: -31.98 }, 520.43, 3),
    ]);
    expect(je.date).toBe("2026-11-10");
    expect(je.payoutDates).toEqual(["2026-11-06", "2026-11-10"]);
    expect(je.net).toBe(1876.43);
    expect(je.memo).toBe("Faire payouts 2026-11-06 to 2026-11-10 — 2 payouts, 9 orders");
    const t = jeTotals(je.lines);
    expect(t.debit).toBe(t.credit);
  });

  it("refuses an empty selection", () => {
    expect(() => buildJournalEntry([])).toThrow(/at least one/);
  });
});
