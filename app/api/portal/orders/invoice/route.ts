import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { buildInvoice } from "@/lib/invoice";

export const runtime = "nodejs";

/**
 * GET /api/portal/orders/invoice?num=<orderNum>
 *
 * Assembles a Fishbowl-style invoice for one of the rep's own orders from the
 * synced tables (sales_orders_raw + so_items_raw + so_shipments_raw) and returns
 * the InvoiceModel the client renders + prints. Agency-scoped exactly like the
 * orders API: the order's customer must belong to the caller's agency, so a rep
 * can only invoice their own accounts' orders.
 */

const ORDER_COLS =
  "id, num, customerpo, customercontact, billtoname, billtoaddress, billtocity, billtostate, billtozip, shiptoname, shiptoaddress, shiptocity, shiptostate, shiptozip, dateissued, datecreated, totalprice";

export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const num = new URL(request.url).searchParams.get("num");
  if (!num) return NextResponse.json({ error: "Missing order number." }, { status: 400 });

  const agency = String(rep.agencyCode);

  // The agency's customers — the boundary, plus a name lookup for "Customer:".
  const { data: custData, error: custErr } = await supabaseServer
    .from("customer_summary")
    .select("customerid, name")
    .eq("agency_code", agency);
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
  const nameById = new Map(
    ((custData ?? []) as { customerid: string; name: string }[]).map((r) => [r.customerid, r.name]),
  );

  const { data: orderRow, error: ordErr } = await supabaseServer
    .from("sales_orders_raw")
    .select(`${ORDER_COLS}, customerid`)
    .eq("num", num)
    .limit(1)
    .maybeSingle();
  if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 });

  const order = orderRow as (Record<string, unknown> & { id: number; customerid: string | null }) | null;
  // Re-check membership — an order number alone proves nothing.
  if (!order || !order.customerid || !nameById.has(order.customerid)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [{ data: itemData }, { data: shipData }] = await Promise.all([
    supabaseServer
      .from("so_items_raw")
      .select("solineitem, productnum, description, qtyordered, totalprice, typename")
      .eq("soid", order.id)
      .order("solineitem", { ascending: true }),
    supabaseServer
      .from("so_shipments_raw")
      .select("carrier, tracking_num, dateshipped")
      .eq("soid", order.id),
  ]);

  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "long",
    timeStyle: "medium",
  });

  const invoice = buildInvoice(
    {
      ...(order as Record<string, unknown>),
      customer_name: nameById.get(order.customerid) ?? order.billtoname,
    } as Parameters<typeof buildInvoice>[0],
    (itemData ?? []) as Parameters<typeof buildInvoice>[1],
    (shipData ?? []) as Parameters<typeof buildInvoice>[2],
    { generatedAt },
  );

  return NextResponse.json({ invoice });
}
