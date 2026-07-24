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

const ORDER_COLS_BASE =
  "id, customerid, num, customerpo, customercontact, billtoname, billtoaddress, billtocity, billtostate, billtozip, shiptoname, shiptoaddress, shiptocity, shiptostate, shiptozip, dateissued, datecreated, totalprice";
/** SO info-band fields — present only once the invoice-fields migration lands. */
const ORDER_COLS_INFO = "salesman, payment_terms, fob_point, carrier, ship_service";

type OrderRow = Record<string, unknown> & { id: number; customerid: string | null };

/**
 * Fetch one order, preferring the invoice info-band columns but falling back to
 * the base set if that migration hasn't been applied yet — so a deploy that
 * lands before the migration still produces invoices (with blank info fields)
 * instead of erroring.
 */
async function fetchOrder(num: string): Promise<{ data: OrderRow | null; error: string | null }> {
  const full = await supabaseServer
    .from("sales_orders_raw")
    .select(`${ORDER_COLS_BASE}, ${ORDER_COLS_INFO}`)
    .eq("num", num)
    .limit(1)
    .maybeSingle();
  if (!full.error) return { data: full.data as OrderRow | null, error: null };
  if (full.error.code !== "42703" && !/does not exist/i.test(full.error.message)) {
    return { data: null, error: full.error.message };
  }
  const base = await supabaseServer
    .from("sales_orders_raw")
    .select(ORDER_COLS_BASE)
    .eq("num", num)
    .limit(1)
    .maybeSingle();
  return { data: base.data as OrderRow | null, error: base.error?.message ?? null };
}

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

  const { data: order, error: ordErr } = await fetchOrder(num);
  if (ordErr) return NextResponse.json({ error: ordErr }, { status: 500 });

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
