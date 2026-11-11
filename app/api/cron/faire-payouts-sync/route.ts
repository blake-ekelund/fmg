import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { syncFairePayoutOrders } from "@/lib/fairePayoutsStore";

export const runtime = "nodejs";
// The first run backfills ~13 months of Faire orders (~90s of paging); later runs are seconds.
export const maxDuration = 300;

/**
 * GET /api/cron/faire-payouts-sync
 *
 * Hourly in vercel.json: copies paid Faire orders (and their payout breakdown)
 * into faire_payout_orders for Accounting → Faire Payouts — only orders Faire
 * changed since the last run. Read-only towards Faire. ?full=1 re-reads the
 * whole window. Staff can trigger it by hand (the page's Refresh button).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const isCronCall = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCronCall) {
    const user = await requireInternalUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const full = new URL(request.url).searchParams.get("full") === "1";
  try {
    const result = await syncFairePayoutOrders({ full });
    console.info(`faire-payouts-sync: checked ${result.checked}, saved ${result.saved} paid orders since ${result.since}`);
    return NextResponse.json(result);
  } catch (e) {
    console.error("faire-payouts-sync failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
