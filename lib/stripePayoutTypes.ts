/**
 * Shapes for Accounting → Stripe Payouts (client-safe; the Stripe calls live in
 * lib/stripePayouts.ts). One payout = one bank deposit = one journal entry:
 *
 *   Dr Bank (net)  ·  Dr Stripe fees  ·  Cr A/R for the orders it paid  ·  ± refunds/other
 *
 * Fishbowl already pushed each order to QuickBooks as an invoice, so the
 * payout clears those receivables — the lines say which orders it paid.
 */

export type PayoutLineKind = "payment" | "refund" | "fee" | "other";

export type PayoutOrder = {
  id: string;
  number: string;
  store: string | null;
  channel: string | null;
  customer: string | null;
  fishbowlNum: string | null;
  fishbowlCustomer: string | null;
  total: number | null;
};

export type PayoutLine = {
  id: string;
  kind: PayoutLineKind;
  /** Stripe's balance-transaction type, e.g. charge, refund, stripe_fee. */
  type: string;
  /** YYYY-MM-DD the money moved. */
  date: string;
  description: string;
  amount: number;
  fee: number;
  net: number;
  /** What the Stripe payment said it was for (order_number / order_id metadata). */
  orderRef: string | null;
  order: PayoutOrder | null;
};

export type PayoutSummary = {
  id: string;
  /** YYYY-MM-DD it reached the bank. */
  arrivalDate: string;
  status: string;
  payments: number;
  refunds: number;
  /** Negative: Stripe's processing fees. */
  fees: number;
  other: number;
  /** = the bank deposit. */
  net: number;
  reconciles: boolean;
  unmatched: number;
  lines: PayoutLine[];
};

export type PayoutPage = {
  configured: boolean;
  payouts: PayoutSummary[];
  hasMore: boolean;
};
