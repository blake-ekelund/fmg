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
    // A cron's JSON response goes to Vercel and is discarded, so a failed
    // insert used to vanish into the `failed` array unseen — an order silently
    // not arriving, with nothing anywhere to say so. Log it, so it lands in the
    // function logs where someone can actually find it.
    if (result.failed.length > 0) {
      console.error(
        `[markettime-order-sync] ${result.failed.length} order(s) FAILED to import:`,
        JSON.stringify(result.failed),
      );
    }
    if (result.termsUnclassified.length > 0) {
      console.warn(
        `[markettime-order-sync] ${result.termsUnclassified.length} order(s) booked NET 30 by fallback — payment terms unreadable:`,
        JSON.stringify(result.termsUnclassified),
      );
    }
    if (!dry && result.imported.length > 0) {
      console.log(
        `[markettime-order-sync] imported ${result.imported.length} order(s):`,
        JSON.stringify(result.imported.map((i) => i.ref)),
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
