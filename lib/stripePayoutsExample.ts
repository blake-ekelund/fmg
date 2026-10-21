import type { PayoutLine, PayoutSummary } from "@/lib/stripePayoutTypes";

/**
 * Made-up payouts for the page's "Show example" toggle, so staff can see how a
 * payout breaks down before real Stripe volume exists. Not real customers or
 * orders — the page labels it as an example everywhere it's shown.
 */

const fee = (amt: number) => -Math.round((amt * 0.029 + 0.3) * 100) / 100;

function pay(id: string, date: string, num: string, customer: string, fb: string, amt: number, store = "sassy", channel = "d2c"): PayoutLine {
  const f = fee(amt);
  return {
    id,
    kind: "payment",
    type: "charge",
    date,
    description: `Sassy order ${num}`,
    amount: amt,
    fee: f,
    net: Math.round((amt + f) * 100) / 100,
    orderRef: num,
    order: { id, number: num, store, channel, customer, fishbowlNum: fb, fishbowlCustomer: channel === "d2c" ? "SASSY WEB" : customer.toUpperCase(), total: amt },
  };
}

function build(id: string, arrivalDate: string, lines: PayoutLine[]): PayoutSummary {
  const sum = (k: PayoutLine["kind"]) => Math.round(lines.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const fees = Math.round((lines.reduce((s, l) => s + l.fee, 0) + sum("fee")) * 100) / 100;
  const net = Math.round(lines.reduce((s, l) => s + l.net, 0) * 100) / 100;
  return {
    id,
    arrivalDate,
    status: "paid",
    payments: sum("payment"),
    refunds: sum("refund"),
    fees,
    other: sum("other"),
    net,
    reconciles: true,
    unmatched: lines.filter((l) => (l.kind === "payment" || l.kind === "refund") && !l.order).length,
    lines,
  };
}

export const EXAMPLE_PAYOUTS: PayoutSummary[] = [
  build("po_example_3", "2026-10-17", [
    pay("ex31", "2026-10-14", "10482", "Jordan Example", "E-5521", 64.9),
    pay("ex32", "2026-10-14", "10483", "Casey Sample", "E-5522", 38.5),
    pay("ex33", "2026-10-15", "WS-2291", "Example Gift Shop", "E-5480", 412.0, "sassy", "wholesale"),
    {
      id: "ex34",
      kind: "refund",
      type: "refund",
      date: "2026-10-15",
      description: "Refund for order 10471",
      amount: -24.95,
      fee: 0,
      net: -24.95,
      orderRef: "10471",
      order: { id: "ex34", number: "10471", store: "sassy", channel: "d2c", customer: "Riley Demo", fishbowlNum: "E-5507", fishbowlCustomer: "SASSY WEB", total: 24.95 },
    },
  ]),
  build("po_example_2", "2026-10-16", [
    pay("ex21", "2026-10-13", "10479", "Morgan Placeholder", "E-5517", 89.85),
    pay("ex22", "2026-10-13", "10480", "Taylor Test", "E-5518", 29.95),
    {
      id: "ex23",
      kind: "payment",
      type: "charge",
      date: "2026-10-13",
      description: "Payment with no order attached",
      amount: 50.0,
      fee: -1.75,
      net: 48.25,
      orderRef: null,
      order: null,
    },
  ]),
  build("po_example_1", "2026-10-15", [
    pay("ex11", "2026-10-12", "10476", "Avery Example", "E-5512", 120.4),
    pay("ex12", "2026-10-12", "10477", "Quinn Sample", "E-5513", 45.0),
    { id: "ex13", kind: "fee", type: "stripe_fee", date: "2026-10-12", description: "Stripe Tax fee", amount: -0.5, fee: 0, net: -0.5, orderRef: null, order: null },
  ]),
];
