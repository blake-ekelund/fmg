/**
 * Faire payouts → journal entries (Accounting → Faire Payouts). Pure: the
 * store (lib/fairePayoutsStore.ts) fetches orders from the Faire API and
 * hands them here.
 *
 * Faire's API has no payouts endpoint, but every order carries its own payout
 * breakdown (`payout_costs`) and the moment Faire paid it
 * (`payment_initiated_at`). A payout here = the orders Faire paid on one day
 * (Central time) — the deposit that lands in the bank.
 *
 * The arithmetic, verified 2026-11-11 against 183 paid orders (182 tie to the
 * cent; the last has an unitemised deduction, which lands in Other):
 *
 *   total_payout = subtotal_after_brand_discounts
 *                − commission − payout_fee − payout_protection_fee
 *                + Σ shipments.maker_cost      (label cost Faire reimburses)
 *                − shipping_subsidy            (taken back on free-shipping orders)
 *                + net_tax
 *
 * `damaged_and_missing_items` is REPORTED but not deducted from the payout
 * (on every order that has one, subtracting it breaks the tie), so it is
 * shown for information, not booked.
 */

export const FAIRE_JE_COLUMNS = [
  "grossSales",
  "brandDiscounts",
  "commission",
  "processingFees",
  "shippingReimbursed",
  "shippingSubsidy",
  "other",
] as const;
export type FaireJeColumn = (typeof FAIRE_JE_COLUMNS)[number];

export const FAIRE_JE_LABELS: Record<FaireJeColumn, string> = {
  grossSales: "Sales",
  brandDiscounts: "Brand Discounts",
  commission: "Faire Commission",
  processingFees: "Processing Fees",
  shippingReimbursed: "Shipping Reimbursed",
  shippingSubsidy: "Shipping Subsidy",
  other: "Other",
};

/** Money Faire pays in — shown first, before the Total Received subtotal. */
export const FAIRE_INCOME_COLUMNS = ["grossSales", "shippingReimbursed"] as const satisfies readonly FaireJeColumn[];
/** What Faire nets back out — shown after the Total Received subtotal. */
export const FAIRE_COST_COLUMNS = ["brandDiscounts", "commission", "processingFees", "shippingSubsidy", "other"] as const satisfies readonly FaireJeColumn[];

/** Sales + Shipping Reimbursed — what Faire pays in before it nets its costs. */
export const faireReceived = (columns: Record<FaireJeColumn, number>) =>
  FAIRE_INCOME_COLUMNS.reduce((s, c) => s + columns[c], 0);

/**
 * Column order every per-order / per-payout breakdown table and CSV reads in:
 * the income (Sales, Shipping Reimbursed), a Total Received subtotal, then the
 * costs Faire nets out. Net payout is shown after this, on its own.
 */
export const FAIRE_FLOW_COLUMNS: { key: FaireJeColumn | "received"; label: string }[] = [
  ...FAIRE_INCOME_COLUMNS.map((c) => ({ key: c, label: FAIRE_JE_LABELS[c] })),
  { key: "received", label: "Total Received" },
  ...FAIRE_COST_COLUMNS.map((c) => ({ key: c, label: FAIRE_JE_LABELS[c] })),
];

/** The value of a flow column: the received subtotal, or a plain payout column. */
export const faireFlowValue = (columns: Record<FaireJeColumn, number>, key: FaireJeColumn | "received") =>
  key === "received" ? faireReceived(columns) : columns[key];

/** Payout days are calendar days in Central time (where FMG books). */
export const PAYOUT_TIME_ZONE = "America/Chicago";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const minor = (v: unknown): number => {
  const n = Number(rec(v).amount_minor ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const cents = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export type FairePayoutLine = { sku: string; product: string; quantity: number; unitPrice: number; tester: boolean };

export type FairePayoutOrder = {
  orderId: string;
  displayId: string;
  retailer: string;
  /** When Faire paid it (ISO). */
  paidAt: string;
  /** Payout day, YYYY-MM-DD in Central time. */
  payoutDate: string;
  state: string;
  lines: FairePayoutLine[];
  columns: Record<FaireJeColumn, number>;
  /** What Faire paid for this order (= the columns' sum). */
  net: number;
  /** Damaged / missing items Faire reported — informational, not deducted. */
  damagedReported: number;
};

export type FairePayout = {
  /** YYYY-MM-DD — the payout's identity (the day Faire paid). */
  date: string;
  orders: FairePayoutOrder[];
  columns: Record<FaireJeColumn, number>;
  net: number;
  units: number;
  /** "In QBO" tick (store attaches; null = not yet, undefined = column not there). */
  qboEnteredAt?: string | null;
  qboEnteredBy?: string | null;
  /** The saved journal entry this payout is in (lib/faireJournalStore.ts), if any. */
  journalEntry?: { id: string; number: string } | null;
};

const zeroCols = () => Object.fromEntries(FAIRE_JE_COLUMNS.map((c) => [c, 0])) as Record<FaireJeColumn, number>;

/** YYYY-MM-DD of an instant in Central time. */
export function payoutDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: PAYOUT_TIME_ZONE });
}

/**
 * One raw Faire order (External API v2) → its share of a payout, in cents
 * internally, dollars out. Returns null for orders Faire hasn't paid yet.
 * `retailer` is the name to show (the store resolves it).
 */
export function payoutOrderFromFaire(raw: unknown, retailer: string): FairePayoutOrder | null {
  const o = rec(raw);
  const paidAt = typeof o.payment_initiated_at === "string" ? o.payment_initiated_at : "";
  const p = rec(o.payout_costs);
  if (!paidAt || !Object.keys(p).length) return null;

  const discounts = minor(p.total_brand_discounts);
  const sub = minor(p.subtotal_after_brand_discounts);
  const shipped = (Array.isArray(o.shipments) ? o.shipments : []).reduce<number>(
    (s, sh) => s + (minor(rec(sh).maker_cost) || cents(rec(sh).maker_cost_cents)),
    0,
  );
  const c: Record<FaireJeColumn, number> = {
    grossSales: sub + discounts,
    brandDiscounts: -discounts,
    commission: -minor(p.commission),
    processingFees: -(minor(p.payout_fee) + minor(p.payout_protection_fee)),
    shippingReimbursed: shipped,
    shippingSubsidy: -minor(p.shipping_subsidy),
    other: minor(p.net_tax),
  };
  const net = minor(p.total_payout);
  // Whatever Faire doesn't itemise lands in Other, so the order always ties to what Faire paid.
  c.other += net - FAIRE_JE_COLUMNS.reduce((s, k) => s + c[k], 0);

  const lines: FairePayoutLine[] = (Array.isArray(o.items) ? o.items : []).flatMap((it) => {
    const i = rec(it);
    const base: FairePayoutLine = {
      sku: String(i.sku ?? ""),
      product: [i.product_name, i.variant_name].filter((v) => typeof v === "string" && v).join(" — "),
      quantity: Number(i.quantity ?? 0),
      unitPrice: cents(i.price_cents) / 100,
      tester: false,
    };
    return i.includes_tester
      ? [base, { ...base, quantity: 1, unitPrice: cents(i.tester_price_cents) / 100, tester: true }]
      : [base];
  });

  return {
    orderId: String(o.id ?? ""),
    displayId: String(o.display_id ?? ""),
    retailer,
    paidAt,
    payoutDate: payoutDay(paidAt),
    state: String(o.state ?? ""),
    lines,
    columns: Object.fromEntries(FAIRE_JE_COLUMNS.map((k) => [k, c[k] / 100])) as Record<FaireJeColumn, number>,
    net: net / 100,
    damagedReported: minor(p.damaged_and_missing_items) / 100,
  };
}

/** Orders → payouts (one per Central-time payment day), newest first. */
export function groupPayouts(orders: FairePayoutOrder[]): FairePayout[] {
  const byDay = new Map<string, FairePayoutOrder[]>();
  for (const o of orders) byDay.set(o.payoutDate, [...(byDay.get(o.payoutDate) ?? []), o]);
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, os]) => {
      const sum = zeroCols();
      for (const o of os) for (const k of FAIRE_JE_COLUMNS) sum[k] += Math.round(o.columns[k] * 100);
      const netCents = os.reduce((s, o) => s + Math.round(o.net * 100), 0);
      return {
        date,
        orders: [...os].sort((a, b) => a.paidAt.localeCompare(b.paidAt)),
        columns: Object.fromEntries(FAIRE_JE_COLUMNS.map((k) => [k, sum[k] / 100])) as Record<FaireJeColumn, number>,
        net: netCents / 100,
        units: os.reduce((s, o) => s + o.lines.filter((l) => !l.tester).reduce((u, l) => u + l.quantity, 0), 0),
      };
    });
}

/** Units and sales by SKU across a payout's orders (testers listed separately). */
export function payoutBySku(p: Pick<FairePayout, "orders">): { sku: string; product: string; quantity: number; sales: number; tester: boolean }[] {
  const m = new Map<string, { sku: string; product: string; quantity: number; cents: number; tester: boolean }>();
  for (const o of p.orders)
    for (const l of o.lines) {
      const key = `${l.sku}\u0000${l.tester}`;
      const r = m.get(key) ?? { sku: l.sku, product: l.product, quantity: 0, cents: 0, tester: l.tester };
      r.quantity += l.quantity;
      r.cents += Math.round(l.unitPrice * 100) * l.quantity;
      m.set(key, r);
    }
  return [...m.values()]
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }) || Number(a.tester) - Number(b.tester))
    .map((r) => ({ sku: r.sku, product: r.product, quantity: r.quantity, sales: r.cents / 100, tester: r.tester }));
}

/** Every payout column for a set of payouts — income, Total Received, costs, net — the CSV the entries are keyed from. */
export function payoutsCsvRows(payouts: FairePayout[]): string[][] {
  return [
    ["Payout date", "Orders", ...FAIRE_FLOW_COLUMNS.map((c) => c.label), "Net payout", "Retailers"],
    ...payouts.map((p) => [
      p.date,
      String(p.orders.length),
      ...FAIRE_FLOW_COLUMNS.map((c) => faireFlowValue(p.columns, c.key).toFixed(2)),
      p.net.toFixed(2),
      [...new Set(p.orders.map((o) => o.retailer))].join("; "),
    ]),
  ];
}
