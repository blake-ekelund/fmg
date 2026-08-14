import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { stripe, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/charge-wholesale-due
 *
 * Wholesale "card on file, charge 30 days after ship." Finds wholesale orders
 * that shipped ≥30 days ago, are still unpaid, haven't been charged, and were
 * placed under the card-on-file regime (payment_terms='card on file' — the
 * storefront stamps that only when a card was vaulted). For each, it charges the
 * saved card OFF-SESSION via Stripe, then flips payment_status='paid'.
 *
 * SAFETY:
 *  - Ships DARK: real charges fire only when WHOLESALE_CHARGE_ENABLED='on'.
 *    Otherwise (and with ?dry=1) it reports what it WOULD charge, touching nothing.
 *  - payment_terms='card on file' gate means historical terms orders (no card,
 *    or placed before this feature) are never swept up.
 *  - Idempotency key per order + charged_at claim → never double-charges.
 *  - A decline / auth-required leaves the order unpaid (retried next run) and is
 *    reported in `skipped` for follow-up.
 */

const CHARGE_AFTER_DAYS = 30;
const CARD_ON_FILE_TERMS = "card on file";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const enabled = process.env.WHOLESALE_CHARGE_ENABLED === "on";

  if (!stripeConfigured() || !stripe) {
    return NextResponse.json({ note: "Stripe not configured (STRIPE_SECRET_KEY).", charged: [] });
  }
  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase isn't connected." }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - CHARGE_AFTER_DAYS * 86400_000).toISOString();

  const { data: orders, error } = await admin
    .from("orders")
    .select(
      "id, number, store, channel, total, payment_status, payment_terms, shipped_at, charged_at, profile_id, business_name",
    )
    .eq("channel", "wholesale")
    .eq("payment_terms", CARD_ON_FILE_TERMS)
    .eq("payment_status", "unpaid")
    .is("charged_at", null)
    .not("shipped_at", "is", null)
    .lte("shipped_at", cutoff);
  if (error) {
    if (/charged_at|payment_terms|schema cache|column/i.test(error.message)) {
      return NextResponse.json({
        note: `orders columns missing — push migration 20260814000000: ${error.message}`,
        charged: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!orders || orders.length === 0) {
    return NextResponse.json({ due: 0, charged: [], skipped: [], dry, enabled });
  }

  // Saved cards for these accounts.
  const profileIds = Array.from(new Set(orders.map((o) => o.profile_id).filter(Boolean)));
  const { data: profiles } = await admin
    .from("storefront_profiles")
    .select("id, stripe_customer_id, stripe_payment_method_id")
    .in("id", profileIds as string[]);
  const cardByProfile = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  const refOf = (o: (typeof orders)[number]) =>
    `${o.store === "ni" ? "NI" : "SASSY"}-${o.number}`;

  const charged: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const o of orders) {
    const ref = refOf(o);
    const card = o.profile_id ? cardByProfile.get(o.profile_id as string) : null;
    const amountCents = Math.round(Number(o.total ?? 0) * 100);

    if (!card?.stripe_customer_id || !card?.stripe_payment_method_id) {
      skipped.push({ ref, reason: "no card on file" });
      continue;
    }
    if (amountCents <= 0) {
      skipped.push({ ref, reason: "zero/negative total" });
      continue;
    }

    if (dry || !enabled) {
      charged.push({
        ref,
        amount: amountCents / 100,
        customer: card.stripe_customer_id,
        wouldCharge: true,
      });
      continue;
    }

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          customer: card.stripe_customer_id as string,
          payment_method: card.stripe_payment_method_id as string,
          off_session: true,
          confirm: true,
          description: `Wholesale ${ref} — card on file, ship+30`,
          metadata: { order_id: String(o.id), order_ref: ref, store: String(o.store ?? "") },
        },
        { idempotencyKey: `wholesale-charge-${o.id}` },
      );

      if (pi.status === "succeeded") {
        await admin
          .from("orders")
          .update({
            payment_status: "paid",
            charged_at: new Date().toISOString(),
            payment_intent_id: pi.id,
          })
          .eq("id", o.id)
          .is("charged_at", null);
        charged.push({ ref, amount: amountCents / 100, paymentIntent: pi.id });
      } else {
        // requires_action / processing — leave unpaid, surface for follow-up.
        skipped.push({ ref, reason: `payment status ${pi.status}`, paymentIntent: pi.id });
      }
    } catch (e) {
      // Declined or authentication_required: leave unpaid (next run retries) and
      // flag it. A follow-up dunning step would email the buyer a confirm link.
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push({ ref, reason: `charge failed: ${msg.slice(0, 160)}` });
    }
  }

  return NextResponse.json({ due: orders.length, charged, skipped, dry, enabled });
}
