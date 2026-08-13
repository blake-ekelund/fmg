import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { markettimeConfigured } from "@/lib/markettime";
import { importMarketTimeOrders } from "@/lib/markettimeImport";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/markettime-order-sync
 *
 * Pulls MarketTime marketplace orders into the `orders` table so they join the
 * SAME pipeline as Faire + storefront orders: they appear in Purchases, match
 * to a real Fishbowl customer (MarketTime provides emails → strong matching),
 * and a human pushes matched ones to Fishbowl (marketplace orders never
 * auto-push — same policy as Faire).
 *
 * Shape: source='markettime', external_ref=publicOrderID (unique idx →
 * idempotent), store='markettime' (no storefront customer emails fire),
 * channel='wholesale', payment 'paid'. Fishbowl Customer PO = <id>-MKTTIME.
 *
 * Ships dark until MARKETTIME_API_KEY + MARKETTIME_WHO_AM_I are set.
 * ?dry=1 reports without writing.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authz === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!markettimeConfigured()) {
    return NextResponse.json({
      imported: [],
      note: "MarketTime isn't configured (MARKETTIME_API_KEY / MARKETTIME_WHO_AM_I) — sync is dark.",
    });
  }
  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase isn't connected." }, { status: 500 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const result = await importMarketTimeOrders(admin, { dry });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
