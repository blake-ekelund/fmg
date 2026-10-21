import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAllowedPaths } from "@/components/navConfig";
import type { UserRole } from "@/components/UserContext";
import { listStripePayouts } from "@/lib/stripePayouts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/accounting/stripe-payouts?after=po_… → PayoutPage
 *
 * 10 payouts per page, newest first, straight from Stripe (read-only), each
 * broken into payments / refunds / fees and matched to our orders. Pass the
 * last payout id as `after` for the next (older) page. Owner/admin only.
 */

const PAGE_PATH = "/accounting/stripe-payouts";

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user || !getAllowedPaths(user.access as UserRole).includes(PAGE_PATH)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const after = new URL(request.url).searchParams.get("after");
  try {
    return NextResponse.json(
      await listStripePayouts({ limit: 10, startingAfter: after && after.startsWith("po_") ? after : undefined }),
    );
  } catch (e) {
    console.error("[stripe-payouts]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't reach Stripe." }, { status: 502 });
  }
}
