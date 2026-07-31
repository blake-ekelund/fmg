import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { configuredCarriers, getDeliveryStatus } from "@/lib/carrierTracking";
import { detectCarrier, isCarrierId, type CarrierId } from "@/lib/tracking";
import { notifyStorefrontDelivered } from "@/lib/storefrontShipped";
import { orderRef, type StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/carrier-delivery-sync
 *
 * The last leg of the fulfillment loop: for orders that shipped but haven't
 * been marked delivered, ask the carrier's FREE tracking API (lib/
 * carrierTracking.ts — USPS / FedEx / UPS, each enabled by its env keys)
 * whether the package has landed. On delivery:
 *
 *  1. stamps orders.delivered_at (carrier's timestamp when available);
 *  2. pings the storefront's /api/orders/delivered endpoint, which claims
 *     delivered_email_at atomically and sends the customer their "it's here"
 *     email exactly once.
 *
 * Carriers without keys are skipped and reported, so USPS can run before the
 * FedEx/UPS registrations clear. Per-order API errors are logged and retried
 * next run — one bad tracking number never blocks the batch.
 *
 * Auth: Vercel cron Bearer CRON_SECRET, or a signed-in user.
 *   ?dry=1 — report statuses, stamp/send nothing.
 */

const LOOKBACK_DAYS = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase isn't connected." }, { status: 500 });
  }

  const enabled = configuredCarriers();
  if (enabled.length === 0) {
    return NextResponse.json({
      watched: 0,
      delivered: [],
      note: "No carrier API keys configured (USPS_/FEDEX_/UPS_CLIENT_ID+SECRET).",
    });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: orders, error } = await admin
    .from("orders")
    .select("*")
    .not("shipped_at", "is", null)
    .not("tracking_code", "is", null)
    .is("delivered_at", null)
    .neq("status", "cancelled")
    .gte("shipped_at", since)
    .returns<StorefrontOrder[]>();
  if (error) {
    // delivered_at is a fresh migration — report cleanly until it's pushed.
    if (/delivered_at|schema cache/i.test(error.message)) {
      return NextResponse.json({
        watched: 0,
        delivered: [],
        note: "orders.delivered_at column missing — push migration 20260731020000.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const delivered: Array<Record<string, unknown>> = [];
  const pending: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  for (const order of orders ?? []) {
    const tracking = (order.tracking_code ?? "").trim();
    const carrier: CarrierId | null = isCarrierId(order.carrier)
      ? order.carrier
      : detectCarrier(tracking);
    const entry = { ref: orderRef(order), carrier, tracking };

    if (!carrier) {
      skipped.push({ ...entry, reason: "carrier unrecognized" });
      continue;
    }
    if (!enabled.includes(carrier)) {
      skipped.push({ ...entry, reason: `${carrier} keys not configured` });
      continue;
    }

    try {
      const status = await getDeliveryStatus(carrier, tracking);
      if (!status) {
        skipped.push({ ...entry, reason: `${carrier} keys not configured` });
        continue;
      }
      if (!status.delivered) {
        pending.push({ ...entry, status: status.summary });
        continue;
      }
      if (dry) {
        delivered.push({ ...entry, status: status.summary, dry: true });
        continue;
      }
      const { error: updateError } = await admin
        .from("orders")
        .update({ delivered_at: status.deliveredAt ?? new Date().toISOString() })
        .eq("id", order.id)
        .is("delivered_at", null); // idempotent under concurrent runs
      if (updateError) {
        failed.push({ ...entry, error: updateError.message });
        continue;
      }
      const emailed = await notifyStorefrontDelivered(order.store, order.number);
      delivered.push({ ...entry, status: status.summary, emailed });
    } catch (err) {
      failed.push({ ...entry, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    watched: (orders ?? []).length,
    carriers: enabled,
    delivered,
    pending: pending.length,
    skipped,
    failed,
    dry,
  });
}
