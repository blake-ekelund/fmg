import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import type { PayoutLine, PayoutLineKind, PayoutOrder, PayoutPage, PayoutSummary } from "@/lib/stripePayoutTypes";

/**
 * Pull payouts straight from Stripe and break each one into the payments,
 * refunds and fees it's made of, matched to our orders.
 *
 * Matching uses what our checkouts stamp on the Stripe payment:
 *   - Sassy checkout: metadata { order_number, store }
 *   - Wholesale card-on-file charge (FMG cron): metadata { order_id }
 *   - fallback: orders.payment_intent_id
 * Anything else (e.g. the pre-2026 website checkout) shows as unmatched.
 */

const cents = (n: number) => n / 100;
const ymd = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

function kindOf(type: string): PayoutLineKind {
  if (type === "charge" || type === "payment") return "payment";
  if (type === "refund" || type === "payment_refund" || type === "payment_failure_refund") return "refund";
  if (type === "stripe_fee" || type === "application_fee" || type.endsWith("_fee")) return "fee";
  return "other";
}

/** The Stripe charge behind a balance transaction (directly, or the one a refund reverses). */
function chargeOf(bt: Stripe.BalanceTransaction): Stripe.Charge | null {
  const src = bt.source;
  if (!src || typeof src === "string") return null;
  if (src.object === "charge") return src as Stripe.Charge;
  if (src.object === "refund") {
    const ch = (src as Stripe.Refund).charge;
    return ch && typeof ch !== "string" ? ch : null;
  }
  return null;
}

type Ref = {
  orderNumber?: string;
  store?: string;
  orderId?: string;
  paymentIntent?: string;
  /** Order number from the pre-2026 website checkout (shown, not matched). */
  legacyOrder?: string;
};

function refOf(ch: Stripe.Charge | null): Ref {
  if (!ch) return {};
  const m = ch.metadata ?? {};
  const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
  return {
    orderNumber: m.order_number,
    store: m.store,
    orderId: m.order_id,
    paymentIntent: pi ?? undefined,
    legacyOrder: m.orderId ? `Old site #${m.orderId}` : undefined,
  };
}

type OrderRow = {
  id: string;
  number: string | number | null;
  store: string | null;
  channel: string | null;
  business_name: string | null;
  contact_name: string | null;
  fishbowl_estimate_num: string | null;
  fishbowl_customer: string | null;
  total: number | null;
  payment_intent_id: string | null;
};

const ORDER_COLS =
  "id, number, store, channel, business_name, contact_name, fishbowl_estimate_num, fishbowl_customer, total, payment_intent_id";

async function loadOrders(refs: Ref[]): Promise<OrderRow[]> {
  const ids = [...new Set(refs.map((r) => r.orderId).filter(Boolean))] as string[];
  const numbers = [...new Set(refs.map((r) => r.orderNumber).filter(Boolean))] as string[];
  const pis = [...new Set(refs.map((r) => r.paymentIntent).filter(Boolean))] as string[];
  const out: OrderRow[] = [];
  const add = async (col: string, vals: string[]) => {
    if (!vals.length) return;
    const { data } = await supabaseServer.from("orders").select(ORDER_COLS).in(col, vals);
    out.push(...((data ?? []) as OrderRow[]));
  };
  await Promise.all([add("id", ids), add("number", numbers), add("payment_intent_id", pis)]);
  return out;
}

function findOrder(orders: OrderRow[], r: Ref): PayoutOrder | null {
  const hit =
    (r.orderId && orders.find((o) => o.id === r.orderId)) ||
    (r.orderNumber &&
      orders.find((o) => String(o.number) === r.orderNumber && (!r.store || !o.store || o.store === r.store))) ||
    (r.paymentIntent && orders.find((o) => o.payment_intent_id === r.paymentIntent)) ||
    null;
  if (!hit) return null;
  return {
    id: hit.id,
    number: String(hit.number ?? ""),
    store: hit.store,
    channel: hit.channel,
    customer: hit.business_name || hit.contact_name,
    fishbowlNum: hit.fishbowl_estimate_num,
    fishbowlCustomer: hit.fishbowl_customer,
    total: hit.total,
  };
}

async function payoutLines(payout: Stripe.Payout): Promise<Stripe.BalanceTransaction[]> {
  if (!stripe) return [];
  const out: Stripe.BalanceTransaction[] = [];
  for await (const bt of stripe.balanceTransactions.list({
    payout: payout.id,
    limit: 100,
    expand: ["data.source", "data.source.charge"],
  })) {
    if (bt.type !== "payout") out.push(bt);
    if (out.length >= 2000) break;
  }
  return out;
}

/** One page (10 by default) of payouts, newest first, each broken down and matched. */
export async function listStripePayouts(opts: { limit?: number; startingAfter?: string }): Promise<PayoutPage> {
  if (!stripe) return { configured: false, payouts: [], hasMore: false };
  const page = await stripe.payouts.list({
    limit: Math.min(opts.limit ?? 10, 25),
    ...(opts.startingAfter ? { starting_after: opts.startingAfter } : {}),
  });

  const perPayout = await Promise.all(page.data.map(async (p) => ({ p, bts: await payoutLines(p) })));
  const refs = perPayout.flatMap(({ bts }) => bts.map((b) => refOf(chargeOf(b))));
  const orders = await loadOrders(refs);

  const payouts: PayoutSummary[] = perPayout.map(({ p, bts }) => {
    const lines: PayoutLine[] = bts.map((b) => {
      const kind = kindOf(b.type);
      const ref = refOf(chargeOf(b));
      return {
        id: b.id,
        kind,
        type: b.type,
        date: ymd(b.created),
        description: b.description ?? "",
        amount: cents(b.amount),
        fee: cents(-b.fee),
        net: cents(b.net),
        orderRef: ref.orderNumber ?? ref.orderId ?? ref.legacyOrder ?? null,
        order: kind === "payment" || kind === "refund" ? findOrder(orders, ref) : null,
      };
    });
    const sum = (k: PayoutLineKind) => lines.filter((l) => l.kind === k).reduce((s, l) => s + Math.round(l.amount * 100), 0);
    const feeCents =
      lines.reduce((s, l) => s + Math.round(l.fee * 100), 0) + sum("fee");
    const total = sum("payment") + sum("refund") + sum("other") + feeCents;
    return {
      id: p.id,
      arrivalDate: ymd(p.arrival_date),
      status: p.status,
      payments: cents(sum("payment")),
      refunds: cents(sum("refund")),
      fees: cents(feeCents),
      other: cents(sum("other")),
      net: cents(p.amount),
      reconciles: total === p.amount,
      unmatched: lines.filter((l) => (l.kind === "payment" || l.kind === "refund") && !l.order).length,
      lines,
    };
  });

  return { configured: true, payouts, hasMore: page.has_more };
}
