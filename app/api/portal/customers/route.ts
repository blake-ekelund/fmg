import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/** Whitelisted columns a rep may see for their customers (no internal-only fields). */
const LIST_COLS =
  "customerid, name, bill_to_state, channel, first_order_date, last_order_date, last_order_amount, lifetime_orders, lifetime_revenue, sales_2023, sales_2024, sales_2025, sales_2026";

/**
 * GET /api/portal/customers          → the rep's agency book of business
 * GET /api/portal/customers?id=<cid> → one customer + contact detail
 *
 * Every query is scoped to the rep's own agency (from the profile). The detail
 * branch re-checks the customer's agency before returning contact PII, so a rep
 * can't read another agency's customer by guessing an id.
 */
export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agency = String(rep.agencyCode);
  const id = new URL(request.url).searchParams.get("id");

  if (id) {
    const { data: cust, error } = await supabaseServer
      .from("customer_summary")
      .select(`${LIST_COLS}, agency_code`)
      .eq("customerid", id)
      .eq("agency_code", agency)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cust) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data: contact } = await supabaseServer
      .from("customer_contact_summary")
      .select(
        "email, phone, billto_address, billto_city, billto_state, billto_zip, shipto_address, shipto_city, shipto_state, shipto_zip",
      )
      .eq("customerid", id)
      .maybeSingle();

    return NextResponse.json({ customer: cust, contact: contact ?? null });
  }

  const { data, error } = await supabaseServer
    .from("customer_summary")
    .select(LIST_COLS)
    .eq("agency_code", agency)
    .order("sales_2026", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data ?? [] });
}
