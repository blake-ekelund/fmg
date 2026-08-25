import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { fishbowlConfigured } from "@/lib/fishbowl";
import { pushOrderEstimate } from "@/lib/fishbowlEstimatePush";
import { orderRef, type StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/fishbowl-estimate-sweep
 *
 * The "trigger" that pushes new storefront orders into Fishbowl as ESTIMATES
 * automatically, two ways:
 *
 *  - ON ENTRY: the storefront checkout pings this route with ?number=<order#>
 *    the moment an order truly completes (recorded-order path, or the Stripe
 *    webhook flipping it to paid) — near-instant entry into Fishbowl. The
 *    targeted form trusts checkout's completion judgment, so it pushes any
 *    channel/payment state (guards for cancelled/already-entered/no-items
 *    still apply).
 *  - BACKSTOP: the 15-minute cron picks up anything the ping missed (deploy
 *    gaps, Fishbowl seat exhaustion, crashes). The cron form pushes wholesale
 *    orders and PAID D2C orders only — an unpaid D2C row is a checkout that
 *    was started but never paid (that's what abandoned-cart recovery reads),
 *    and those must never become Fishbowl estimates on their own.
 *
 * createEstimate is idempotent on the SO number, so ping + cron overlapping
 * can't double-enter an order.
 *
 * PILOT SWITCH: does nothing until FISHBOWL_ESTIMATE_CUSTOMER is set (e.g.
 * "TEST CUSTOMER #1"). Every auto-pushed estimate books under that one
 * Fishbowl customer, so the pilot can't touch real accounts. When the test
 * phase ends, replace this env-customer scheme with real mapping (wholesale
 * account_number → Fishbowl customer; D2C → the house account).
 *
 * Auth: Vercel cron Bearer CRON_SECRET, the storefronts' shared
 * STOREFRONT_NOTIFY_SECRET (for the checkout ping), or a signed-in user (so
 * ?dry is testable from the browser).
 *   ?dry=1       — report what would be pushed, touch nothing.
 *   ?number=1234 — push just that order (the checkout ping).
 *
 * Only orders from the last LOOKBACK_DAYS are considered, so enabling the
 * sweep later can never flush an old backlog into Fishbowl by surprise;
 * anything older stays on the manual button.
 */

const LOOKBACK_DAYS = 7;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const storefrontSecret = process.env.STOREFRONT_NOTIFY_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  const isStorefront = !!storefrontSecret && authz === `Bearer ${storefrontSecret}`;
  if (!isCron && !isStorefront) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customerName = process.env.FISHBOWL_ESTIMATE_CUSTOMER?.trim();
  if (!customerName) {
    return NextResponse.json({
      disabled: true,
      reason: "FISHBOWL_ESTIMATE_CUSTOMER is not set — auto-push is off.",
    });
  }
  if (!fishbowlConfigured()) {
    return NextResponse.json(
      { error: "Fishbowl isn't configured (FISHBOWL_API_URL / _USER / _PASS)." },
      { status: 500 },
    );
  }
  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase isn't connected." }, { status: 500 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const targetNumber = Number(url.searchParams.get("number")) || null;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  let query = admin
    .from("orders")
    .select("*")
    .is("fishbowl_entered_at", null)
    .neq("status", "cancelled")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (targetNumber) query = query.eq("number", targetNumber);
  const { data: orders, error } = await query.returns<StorefrontOrder[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The cron form never pushes an unpaid D2C row — that's a started-but-
  // unpaid checkout (abandoned-cart material), not an order. The targeted
  // ping DOES push it: checkout only pings when the order truly completed
  // (wholesale submit, test-mode completion, or Stripe payment landed).
  // Marketplace orders auto-push again (Blake, 2026-08-25). They were held back
  // from 2026-08-01 because every estimate booked under house agency 100 /
  // JULIE EKELUND on NET 30 terms regardless of the real territory or how the
  // retailer paid; the customer record now supplies the territory and
  // MarketTime's own payment fields supply the terms, so auto-pushing no longer
  // means auto-misattributing. An order with no matched Fishbowl customer is
  // still never pushed — it falls through to noCustomerMatch below.
  const eligible = (orders ?? []).filter(
    (o) =>
      targetNumber != null ||
      o.channel === "wholesale" ||
      o.payment_status === "paid",
  );
  const pushable = eligible.filter((o) =>
    (o.items ?? []).some((it) => it.part && (it.quantity ?? 0) > 0),
  );
  const skipped = eligible.length - pushable.length;

  if (dry || pushable.length === 0) {
    return NextResponse.json({
      dry,
      customer: customerName,
      pending: pushable.map((o) => orderRef(o)),
      skippedWithoutParts: skipped,
      pushed: [],
    });
  }

  // Sequential on purpose: one Fishbowl session per order keeps peak seat
  // use at 1 of the 3 licenses. One bad order never aborts the rest.
  const pushed: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  const noCustomerMatch: string[] = [];
  for (const order of pushable) {
    const ref = orderRef(order);
    // Customer selection: storefront orders ride the pilot env customer;
    // marketplace orders (Faire/MarketTime) book under their MATCHED real
    // customer — no match on file means no push, just the Purchases flag.
    const isMarketplace = order.source === "faire" || order.source === "markettime";
    const bookUnder = isMarketplace
      ? (order.fishbowl_customer as string | null | undefined)?.trim()
      : customerName;
    if (!bookUnder) {
      noCustomerMatch.push(ref);
      continue;
    }
    try {
      const result = await pushOrderEstimate(
        admin,
        order,
        bookUnder,
        targetNumber ? "checkout" : "auto-push",
      );
      pushed.push({ ref, customer: bookUnder, ...result });
    } catch (e) {
      failed.push({ ref, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    customer: customerName,
    pushed,
    failed,
    noCustomerMatch,
    skippedWithoutParts: skipped,
  });
}
