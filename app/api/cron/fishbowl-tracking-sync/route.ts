import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { fishbowlConfigured, runDataQuery } from "@/lib/fishbowl";
import { resolveCarrier } from "@/lib/tracking";
import { notifyStorefrontShipped } from "@/lib/storefrontShipped";
import { orderRef, type StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/fishbowl-tracking-sync
 *
 * Closes the fulfillment loop: watches Fishbowl for tracking numbers landing
 * on the sales orders we pushed (SO number = the storefront ref, e.g.
 * SASSY-1007), and on the no-tracking → tracking transition:
 *
 *  1. writes carrier + tracking_code + shipped_at onto the order — the same
 *     columns the manual shipment editor sets, so the FMG Purchases view AND
 *     the customer's storefront order/account page update immediately;
 *  2. pings the storefront's /api/orders/shipped endpoint, which sends the
 *     customer their "your order is on its way" email exactly once (it claims
 *     shipped_email_at atomically — retries can't double-send).
 *
 * Fishbowl facts (see lib/fishbowlQueries.ts SHIPMENTS_SQL): tracking lives
 * per-carton on shipcarton.trackingNum (ship.soId = so.id); a pre-printed
 * label has a tracking number but NULL dateShipped, so we only treat a carton
 * as shipped once dateShipped is set. Carrier names are ~96% "RATESHOP", so
 * the linkable carrier is derived from the tracking-number format
 * (lib/tracking.ts resolveCarrier).
 *
 * Auth: Vercel cron Bearer CRON_SECRET, or a signed-in user.
 *   ?dry=1 — report what would be updated, touch nothing.
 */

const LOOKBACK_DAYS = 60;

/** Fishbowl datetimes have a malformed tz offset ("...000-05") that
 *  new Date() rejects — take the leading YYYY-MM-DD (same fix as the sales
 *  sync) and stamp noon UTC so the calendar date survives all timezones. */
function parseShipDate(value: unknown): string | null {
  const m = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? `${m[1]}T12:00:00.000Z` : null;
}

const sqlQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  // Orders we've entered into Fishbowl that don't have tracking yet.
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: orders, error } = await admin
    .from("orders")
    .select("*")
    .not("fishbowl_entered_at", "is", null)
    .is("tracking_code", null)
    .neq("status", "cancelled")
    .gte("created_at", since)
    .returns<StorefrontOrder[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fishbowl now auto-assigns SO numbers with the storefront ref riding as
  // Customer PO — so match on BOTH: fishbowl_estimate_num holds the real SO
  // number for new pushes, while the ref (SASSY-####) matches customerPO (new)
  // or so.num (orders pushed before the auto-number switch).
  const waiting = (orders ?? []).map((o) => ({
    order: o,
    soNum: o.fishbowl_estimate_num ?? orderRef(o),
    poRef: orderRef(o),
  }));
  if (waiting.length === 0) {
    return NextResponse.json({ watched: 0, shipped: [] });
  }

  // One Fishbowl session: any shipped cartons for those SOs?
  const keys = Array.from(
    new Set(waiting.flatMap((w) => [sqlQuote(w.soNum), sqlQuote(w.poRef)])),
  ).join(",");
  const cartons = await runDataQuery(
    `SELECT so.num AS orderNum, so.customerPO AS poNum, carrier.name AS carrier,
            shipcarton.trackingNum AS trackingNum, ship.dateShipped AS dateShipped
     FROM shipcarton
     JOIN ship ON shipcarton.shipId = ship.id
     JOIN so ON ship.soId = so.id
     LEFT JOIN carrier ON ship.carrierId = carrier.id
     WHERE shipcarton.trackingNum IS NOT NULL AND shipcarton.trackingNum <> ''
       AND ship.dateShipped IS NOT NULL
       AND (so.num IN (${keys}) OR so.customerPO IN (${keys}))`,
  );

  // First shipped carton per SO wins (multi-carton orders share a shipment;
  // the customer email links one number). Index by both SO num and PO ref.
  const bySo = new Map<string, { carrier: string | null; trackingNum: string; dateShipped: unknown }>();
  for (const c of cartons as Array<Record<string, unknown>>) {
    const hit = {
      carrier: (c.carrier as string) ?? null,
      trackingNum: String(c.trackingNum),
      dateShipped: c.dateShipped,
    };
    for (const key of [String(c.orderNum ?? ""), String(c.poNum ?? "")]) {
      if (key && !bySo.has(key)) bySo.set(key, hit);
    }
  }

  const shipped: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  for (const { order, soNum, poRef } of waiting) {
    const hit = bySo.get(soNum) ?? bySo.get(poRef);
    if (!hit) continue;
    const carrier = resolveCarrier(hit.carrier, hit.trackingNum);
    const entry = {
      ref: orderRef(order),
      soNum,
      carrier,
      tracking: hit.trackingNum,
    };
    if (dry) {
      shipped.push({ ...entry, dry: true });
      continue;
    }
    const { error: updateError } = await admin
      .from("orders")
      .update({
        carrier,
        tracking_code: hit.trackingNum,
        shipped_at: parseShipDate(hit.dateShipped) ?? new Date().toISOString(),
      })
      .eq("id", order.id)
      .is("tracking_code", null); // never clobber a hand-entered number
    if (updateError) {
      failed.push({ ...entry, error: updateError.message });
      continue;
    }
    const emailed = await notifyStorefrontShipped(order.store, order.number);
    shipped.push({ ...entry, emailed });
  }

  return NextResponse.json({ watched: waiting.length, shipped, failed, dry });
}
