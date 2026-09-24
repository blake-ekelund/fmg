import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { supabaseServer } from "@/lib/supabaseServer";
import { runImport, fishbowlConfigured, FishbowlApiError } from "@/lib/fishbowl";
import { buildFishbowlSalesOrder } from "@/lib/fishbowlOrder";
import type { StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/storefront-orders/[id]/fishbowl — actually CREATE this storefront
 * order as a sales order in Fishbowl (the manual test-write harness behind the
 * "Push to Fishbowl" button on the Purchases order page).
 *
 *   ?dry=1   — build + return the payload WITHOUT posting to Fishbowl.
 *   ?force=1 — push even if the order is already marked entered.
 *
 * On success it stamps fishbowl_entered_at / _by (the existing fulfillment gate)
 * and returns the created order Fishbowl echoed back. On failure it returns
 * Fishbowl's raw response body verbatim (nothing is stamped) so we can see
 * exactly which fields the API rejected and correct the mapping.
 *
 * Auth: internal FMG users only.
 */

const PORTAL_OFFLINE =
  "Wholesale portal isn't connected — add WHOLESALE_SUPABASE_URL + WHOLESALE_SUPABASE_SERVICE_ROLE_KEY.";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: PORTAL_OFFLINE }, { status: 500 });

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";

  const { id } = await params;
  const { data, error } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const order = data as StorefrontOrder;

  // Wholesale orders post under the Fishbowl customer tied to the partner's
  // account (maintained on the Partners page), matched by the account email.
  // D2C orders use the per-store web customer resolved inside the builder.
  let customerName: string | null | undefined;
  if (order.channel === "wholesale" && order.email) {
    const { data: partner } = await admin
      .from("profiles")
      .select("fishbowl_customer")
      .eq("role", "wholesale")
      .ilike("email", order.email)
      .maybeSingle();
    customerName =
      (partner as { fishbowl_customer?: string | null } | null)?.fishbowl_customer ?? null;
  }

  const built = buildFishbowlSalesOrder(order, { customerName });

  // Dry run: show exactly what we'd send, post nothing.
  if (dry) {
    return NextResponse.json({ dry: true, importName: built.importName, rows: built.rows });
  }

  if (order.fishbowl_entered_at && !force) {
    return NextResponse.json(
      { error: "Order is already marked entered in Fishbowl. Undo it first, or use ?force=1." },
      { status: 409 },
    );
  }

  if (!fishbowlConfigured()) {
    return NextResponse.json({ error: "Fishbowl is not configured (FISHBOWL_* env)." }, { status: 500 });
  }

  // The live write (a Fishbowl CSV import).
  let created: Record<string, unknown>;
  try {
    created = await runImport(built.importName, built.rows);
  } catch (e) {
    if (e instanceof FishbowlApiError) {
      // Surface Fishbowl's rejection verbatim — this is how we learn the import
      // template (which columns/rows it rejected).
      return NextResponse.json(
        {
          error: e.message,
          status: e.status,
          allow: e.allow,
          fishbowl: e.body,
          importName: built.importName,
          rows: built.rows,
        },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, importName: built.importName, rows: built.rows }, { status: 502 });
  }

  // Created — stamp the fulfillment gate (best-effort SO-number capture from
  // whatever key Fishbowl returns) and clear any pending "enter" task.
  const soNum =
    (created.num ?? created.number ?? created.soNum ?? created.id ?? null) as string | number | null;

  const { data: updated } = await admin
    .from("orders")
    .update({
      fishbowl_entered_at: new Date().toISOString(),
      fishbowl_entered_by: user.email ?? user.id,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  await supabaseServer.from("tasks").delete().eq("fishbowl_order_id", id);

  return NextResponse.json({
    ok: true,
    fishbowlSoNumber: soNum,
    fishbowl: created,
    order: updated ?? order,
  });
}
