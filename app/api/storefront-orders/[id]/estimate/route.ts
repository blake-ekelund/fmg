import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { fishbowlConfigured } from "@/lib/fishbowl";
import { pushOrderEstimate } from "@/lib/fishbowlEstimatePush";
import { type StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/storefront-orders/[id]/estimate
 *
 * Push a storefront order into Fishbowl as an ESTIMATE (SO status 10) via the
 * SalesOrderDetails import — the replacement for hand-keying orders. Pilot
 * phase: the request names the Fishbowl customer explicitly and only the two
 * test customers are allowed, so a mis-mapped name can't touch real accounts
 * (the import auto-creates unknown customers — createEstimate blocks that
 * too). Widen PILOT_CUSTOMERS (or drop the allowlist for a real
 * account-number mapping) when the test phase ends.
 *
 * On success the order is stamped the same way the manual "Mark in Fishbowl"
 * action does (fishbowl_entered_at/by), so it drops out of the Needs-Fishbowl
 * queue and the digest; the estimate number/time also land in
 * fishbowl_estimate_num/_at when those columns exist (see the SQL in the
 * session notes — added manually in the wholesale project, like the prebook
 * table was).
 */

const PORTAL_OFFLINE =
  "Supabase isn't connected — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.";

const PILOT_CUSTOMERS = ["TEST CUSTOMER #1", "TEST CUSTOMER #2"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!fishbowlConfigured()) {
    return NextResponse.json(
      { error: "Fishbowl isn't configured (FISHBOWL_API_URL / _USER / _PASS)." },
      { status: 500 }
    );
  }

  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: PORTAL_OFFLINE }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as {
    customerName?: string;
  };
  const customerName = body.customerName?.trim();
  if (!customerName || !PILOT_CUSTOMERS.includes(customerName)) {
    return NextResponse.json(
      {
        error: `During the estimate pilot, pick one of: ${PILOT_CUSTOMERS.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const { id } = await params;
  const { data: order, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle<StorefrontOrder>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  let result;
  try {
    result = await pushOrderEstimate(
      admin,
      order,
      customerName,
      user.email ?? user.id,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { data: updated } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ order: updated ?? order, ...result });
}
