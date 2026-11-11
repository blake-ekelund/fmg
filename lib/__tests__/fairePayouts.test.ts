import { describe, it, expect } from "vitest";
import { groupPayouts, payoutBySku, payoutOrderFromFaire } from "../fairePayouts";

const money = (minor: number) => ({ amount_minor: minor, currency: "USD" });
const order = (over: {
  id: string;
  paid: string;
  subtotal: number;
  discounts?: number;
  commission: number;
  fee: number;
  ship?: number;
  subsidy?: number;
  damaged?: number;
  total: number;
  items?: unknown[];
}) => ({
  id: `bo_${over.id.toLowerCase()}`,
  display_id: over.id,
  state: "DELIVERED",
  payment_initiated_at: over.paid,
  payout_costs: {
    subtotal_after_brand_discounts: money(over.subtotal),
    total_brand_discounts: money(over.discounts ?? 0),
    commission: money(over.commission),
    payout_fee: money(over.fee),
    payout_protection_fee: money(0),
    shipping_subsidy: money(over.subsidy ?? 0),
    damaged_and_missing_items: money(over.damaged ?? 0),
    net_tax: money(0),
    total_payout: money(over.total),
  },
  shipments: over.ship ? [{ maker_cost: money(over.ship), maker_cost_cents: over.ship }] : [],
  items: over.items ?? [],
});

describe("Faire payout math", () => {
  it("ties a retailer-paid-shipping order to Faire's payout (XGK2A8P4JG)", () => {
    const o = payoutOrderFromFaire(
      order({ id: "XGK2A8P4JG", paid: "2025-12-23T20:06:30.000Z", subtotal: 16217, commission: 2433, fee: 419, ship: 2076, total: 15441 }),
      "Dawn's Shop",
    )!;
    expect(o.columns).toEqual({
      grossSales: 162.17,
      brandDiscounts: -0,
      commission: -24.33,
      processingFees: -4.19,
      shippingReimbursed: 20.76,
      shippingSubsidy: -0,
      other: 0,
    });
    expect(o.net).toBe(154.41);
    expect(o.payoutDate).toBe("2025-12-23");
  });

  it("nets the shipping subsidy against the reimbursement on free-shipping orders", () => {
    const o = payoutOrderFromFaire(
      order({ id: "M6Z34GF62H", paid: "2026-10-01T19:00:00Z", subtotal: 30000, commission: 4500, fee: 750, ship: 5537, subsidy: 5537, total: 24750 }),
      "X",
    )!;
    expect(o.columns.shippingReimbursed).toBe(55.37);
    expect(o.columns.shippingSubsidy).toBe(-55.37);
    expect(o.columns.other).toBe(0);
  });

  it("reports damaged/missing items without deducting them", () => {
    const o = payoutOrderFromFaire(
      order({ id: "A3DAM5ENZM", paid: "2026-10-01T19:00:00Z", subtotal: 36100, commission: 5415, fee: 900, damaged: 500, total: 29785 }),
      "X",
    )!;
    expect(o.damagedReported).toBe(5);
    expect(o.columns.other).toBe(0);
  });

  it("puts anything Faire doesn't itemise in Other, so the order still ties", () => {
    const o = payoutOrderFromFaire(order({ id: "Q", paid: "2026-10-01T19:00:00Z", subtotal: 10000, commission: 1500, fee: 270, total: 7000 }), "X")!;
    expect(o.columns.other).toBe(-12.3);
    expect(Object.values(o.columns).reduce((s, n) => s + n, 0)).toBeCloseTo(70, 2);
  });

  it("skips orders Faire hasn't paid yet", () => {
    expect(payoutOrderFromFaire({ id: "bo_x", payout_costs: {} }, "X")).toBeNull();
  });

  it("groups by the Central-time day Faire paid, newest first", () => {
    const a = payoutOrderFromFaire(order({ id: "A", paid: "2026-11-06T08:05:00Z", subtotal: 10000, commission: 1500, fee: 270, total: 8230 }), "A")!;
    const b = payoutOrderFromFaire(order({ id: "B", paid: "2026-11-06T08:29:00Z", subtotal: 5000, commission: 750, fee: 150, total: 4100 }), "B")!;
    // 03:00 UTC on the 7th is still the 6th in Central time.
    const c = payoutOrderFromFaire(order({ id: "C", paid: "2026-11-07T03:00:00Z", subtotal: 2000, commission: 300, fee: 78, total: 1622 }), "C")!;
    const d = payoutOrderFromFaire(order({ id: "D", paid: "2026-11-08T20:05:00Z", subtotal: 2000, commission: 300, fee: 78, total: 1622 }), "D")!;
    const payouts = groupPayouts([a, b, c, d]);
    expect(payouts.map((p) => [p.date, p.orders.length, p.net])).toEqual([
      ["2026-11-08", 1, 16.22],
      ["2026-11-06", 3, 139.52],
    ]);
  });

  it("totals units and sales by SKU, testers on their own line", () => {
    const o = payoutOrderFromFaire(
      order({
        id: "T",
        paid: "2026-11-06T08:05:00Z",
        subtotal: 7700,
        commission: 0,
        fee: 0,
        total: 7700,
        items: [
          { sku: "110-00-05", product_name: "Lotion", quantity: 3, price_cents: 1200, includes_tester: true, tester_price_cents: 600 },
          { sku: "120-00-02", product_name: "Mini", quantity: 6, price_cents: 600 },
        ],
      }),
      "X",
    )!;
    expect(payoutBySku({ orders: [o] })).toEqual([
      { sku: "110-00-05", product: "Lotion", quantity: 3, sales: 36, tester: false },
      { sku: "110-00-05", product: "Lotion", quantity: 1, sales: 6, tester: true },
      { sku: "120-00-02", product: "Mini", quantity: 6, sales: 36, tester: false },
    ]);
    expect(groupPayouts([o])[0].units).toBe(9);
  });
});
