import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { reconcileMarketplaceFishbowl } from "@/lib/fishbowlReconcile";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/fishbowl-reconcile-marketplace
 *
 * Finds Faire/MarketTime orders that were hand-keyed into Fishbowl but never
 * marked in the app (still "Needs Fishbowl" on the Orders page) and stamps them
 * so their Status reflects reality. STRICT match: bare external_ref in the SO's
 * customerPO AND equal total. Read-only against Fishbowl; only stamps unstamped
 * orders, so it's safe to run repeatedly.
 *
 * ?dry=1 reports what it WOULD stamp without writing.
 */
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

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await reconcileMarketplaceFishbowl(admin, { dry });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
