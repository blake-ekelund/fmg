import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { supabaseServer } from "@/lib/supabaseServer";
import { isCarrierId } from "@/lib/tracking";
import { notifyStorefrontShipped } from "@/lib/storefrontShipped";
import { markFaireOrderShipped } from "@/lib/faire";
import { upcsForParts } from "@/lib/productUpc";

/**
 * A single storefront order (for the Purchases detail / invoice view), plus
 * the Approve action. Reads/writes the wholesale project's `orders` table
 * via the service role — the same source the Purchases list uses.
 */

const PORTAL_OFFLINE =
  "Supabase isn't connected — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: PORTAL_OFFLINE }, { status: 500 });

  const { id } = await params;
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // UPCs for the line items — internal detail for the admin invoice view.
  const items = Array.isArray(data.items)
    ? (data.items as Array<{ part?: string | null }>)
    : [];
  const upcs = await upcsForParts(items.map((it) => it.part));

  return NextResponse.json({ order: data, upcs });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) return NextResponse.json({ error: PORTAL_OFFLINE }, { status: 500 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?:
      | "enter-fishbowl"
      | "clear-fishbowl"
      | "set-tracking"
      | "clear-tracking";
    carrier?: string;
    tracking_code?: string;
  };

  // These stamps deliberately don't touch `status` (its check constraint has a
  // fixed value set). Fishbowl entry is the fulfillment gate that replaces the
  // old "approved" action — set once the order is keyed into Fishbowl. Tracking
  // is a carrier + hand-entered number we link out to (no carrier API),
  // stamped with shipped_at the first time it's saved.
  let patch: Record<string, unknown>;
  if (body.action === "enter-fishbowl") {
    patch = {
      fishbowl_entered_at: new Date().toISOString(),
      fishbowl_entered_by: user.email ?? user.id,
    };
  } else if (body.action === "clear-fishbowl") {
    patch = { fishbowl_entered_at: null, fishbowl_entered_by: null };
  } else if (body.action === "set-tracking") {
    const code = body.tracking_code?.trim();
    if (!isCarrierId(body.carrier)) {
      return NextResponse.json(
        { error: "Pick a carrier (USPS, UPS, or FedEx)." },
        { status: 400 }
      );
    }
    if (!code) {
      return NextResponse.json(
        { error: "Enter a tracking number." },
        { status: 400 }
      );
    }
    // Preserve the original ship date across edits — fixing a typo in the
    // number shouldn't bump shipped_at; only stamp it the first time.
    const { data: existing } = await admin
      .from("orders")
      .select("shipped_at")
      .eq("id", id)
      .maybeSingle();
    patch = {
      carrier: body.carrier,
      tracking_code: code,
      shipped_at: existing?.shipped_at ?? new Date().toISOString(),
    };
  } else if (body.action === "clear-tracking") {
    patch = { carrier: null, tracking_code: null, shipped_at: null };
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Entering an order into Fishbowl instantly clears its "Enter into Fishbowl"
  // task — no waiting for the twice-daily digest sweep (which is the backstop
  // for cancellations/edits). Best-effort; never blocks the order update.
  if (body.action === "enter-fishbowl") {
    await supabaseServer.from("tasks").delete().eq("fishbowl_order_id", id);
  }

  // Hand-entered tracking triggers the customer's "your order shipped" email
  // the same way the tracking cron does. The storefront endpoint claims the
  // send atomically (shipped_email_at), so edits/retries can't double-send.
  // Faire orders confirm to the marketplace instead (gated by FAIRE_SHIP_SYNC).
  if (body.action === "set-tracking" && data) {
    const row = data as {
      store?: string | null;
      number?: number | null;
      source?: string | null;
      external_ref?: string | null;
      carrier?: string | null;
      tracking_code?: string | null;
    };
    if (row.source === "faire" && row.external_ref && row.tracking_code) {
      try {
        await markFaireOrderShipped(`${row.external_ref}-FAIRE`, row.carrier ?? null, row.tracking_code);
      } catch (err) {
        console.error("[faire] ship notify failed:", err);
      }
    } else {
      await notifyStorefrontShipped(row.store, row.number);
    }
  }

  return NextResponse.json({ order: data });
}
