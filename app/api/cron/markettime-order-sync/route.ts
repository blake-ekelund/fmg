import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { markettimeConfigured, getMarketTimeOrders, type MarketTimeOrder } from "@/lib/markettime";
import { loadCustomerIndex, matchCustomer } from "@/lib/customerMatch";

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

  let orders: MarketTimeOrder[];
  try {
    orders = await getMarketTimeOrders();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (orders.length === 0) {
    return NextResponse.json({ checked: 0, imported: [], dry });
  }

  const refs = orders.map((o) => o.displayId);
  const { data: existing, error: exErr } = await admin
    .from("orders")
    .select("external_ref")
    .eq("source", "markettime")
    .in("external_ref", refs);
  if (exErr) {
    if (/source|external_ref|schema cache/i.test(exErr.message)) {
      return NextResponse.json({
        imported: [],
        note: "orders.source/external_ref missing — push migration 20260801000000.",
      });
    }
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  const seen = new Set((existing ?? []).map((r) => r.external_ref as string));

  const customerIndex = await loadCustomerIndex();
  const imported: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  for (const o of orders) {
    if (seen.has(o.displayId)) continue;

    const items = o.items.map((it, i) => ({
      line_no: i + 1,
      type: "sale",
      part: it.sku ?? undefined,
      name: it.name ?? "MarketTime item",
      form: it.variant,
      price: it.price,
      quantity: it.quantity,
      total: it.price * it.quantity,
    }));

    const addr = o.address;
    const orderAddress = addr
      ? {
          name: addr.name ?? undefined,
          company: addr.company,
          line1: addr.line1 ?? undefined,
          line2: addr.line2,
          city: addr.city ?? undefined,
          state: addr.state ?? undefined,
          postal_code: addr.postal_code ?? undefined,
          country: addr.country,
          phone: addr.phone,
        }
      : null;

    const businessName = o.retailerName ?? addr?.company ?? "MarketTime retailer";
    const match = matchCustomer(customerIndex, {
      business_name: businessName,
      email: o.email, // MarketTime provides emails → email match preferred
      ship_city: addr?.city ?? null,
      ship_state: addr?.state ?? null,
    });

    const row: Record<string, unknown> = {
      source: "markettime",
      external_ref: o.displayId,
      store: "markettime",
      channel: "wholesale",
      status: "new",
      payment_status: "paid",
      payment_terms: "MARKETTIME",
      business_name: businessName,
      contact_name: o.contactName ?? businessName,
      email: o.email,
      phone: addr?.phone ?? null,
      ship_to: orderAddress,
      bill_to: orderAddress,
      items,
      subtotal: o.subtotal,
      shipping: o.shipping,
      tax: 0,
      discount: o.discount,
      total: o.subtotal + o.shipping - o.discount,
      note: `MarketTime order ${o.displayId} (${o.state}) — imported by markettime-order-sync.`,
      fishbowl_customer: match?.name ?? null,
      fishbowl_customer_id: match?.customerId ?? null,
    };

    if (dry) {
      imported.push({
        ref: `${o.displayId}-MKTTIME`,
        items: items.length,
        subtotal: o.subtotal,
        customer: match ? `${match.name} (${match.via})` : "NO MATCH",
        dry: true,
      });
      continue;
    }
    let { error } = await admin.from("orders").insert(row);
    if (error && /fishbowl_customer|schema cache/i.test(error.message)) {
      delete row.fishbowl_customer;
      delete row.fishbowl_customer_id;
      ({ error } = await admin.from("orders").insert(row));
    }
    if (error) {
      failed.push({ ref: `${o.displayId}-MKTTIME`, error: error.message });
      continue;
    }
    imported.push({
      ref: `${o.displayId}-MKTTIME`,
      items: items.length,
      subtotal: o.subtotal,
      customer: match ? `${match.name} (${match.via})` : "NO MATCH",
    });
  }

  // Self-heal: stamp any previously-imported unmatched MarketTime order.
  const rematched: Array<Record<string, unknown>> = [];
  if (!dry) {
    const { data: unmatched, error: unErr } = await admin
      .from("orders")
      .select("id, external_ref, business_name, email, ship_to")
      .eq("source", "markettime")
      .is("fishbowl_customer", null);
    if (!unErr) {
      for (const u of unmatched ?? []) {
        const shipTo = (u.ship_to ?? {}) as { city?: string | null; state?: string | null };
        const match = matchCustomer(customerIndex, {
          business_name: u.business_name as string | null,
          email: u.email as string | null,
          ship_city: shipTo.city ?? null,
          ship_state: shipTo.state ?? null,
        });
        if (!match) continue;
        const { error: upErr } = await admin
          .from("orders")
          .update({ fishbowl_customer: match.name, fishbowl_customer_id: match.customerId })
          .eq("id", u.id);
        if (!upErr) rematched.push({ ref: `${u.external_ref}-MKTTIME`, customer: `${match.name} (${match.via})` });
      }
    }
  }

  return NextResponse.json({ checked: orders.length, imported, rematched, failed, dry });
}
