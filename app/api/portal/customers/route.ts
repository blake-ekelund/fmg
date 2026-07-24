import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { fetchOpenOrderCustomerIds } from "@/lib/orderStage";

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

    const [detailYtd, openIds] = await Promise.all([
      ytdByCustomer([id]),
      fetchOpenOrderCustomerIds(supabaseServer, { customerIds: [id] }),
    ]);

    return NextResponse.json({
      customer: {
        ...cust,
        ...(detailYtd.byCustomer.get(id) ?? EMPTY_YTD),
        has_open_order: openIds.has(id),
      },
      contact: contact ?? null,
      ytdThrough: detailYtd.throughLabel,
    });
  }

  const { data, error } = await supabaseServer
    .from("customer_summary")
    .select(LIST_COLS)
    .eq("agency_code", agency)
    .order("sales_2026", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customers = (data ?? []) as Record<string, unknown>[];
  const ids = customers.map((c) => String(c.customerid)).filter(Boolean);

  const [ytd, openOrderIds] = await Promise.all([
    ytdByCustomer(ids),
    fetchOpenOrderCustomerIds(supabaseServer, { customerIds: ids }),
  ]);

  return NextResponse.json({
    customers: customers.map((c) => ({
      ...c,
      ...(ytd.byCustomer.get(String(c.customerid)) ?? EMPTY_YTD),
      has_open_order: openOrderIds.has(String(c.customerid)),
    })),
    ytdThrough: ytd.throughLabel,
  });
}

/* ── Year-to-date ──────────────────────────────────────────────────────────
   customer_summary only carries whole-year totals, so a like-for-like YTD
   comparison has to be aggregated from raw orders: for each year, everything
   from Jan 1 up to today's month/day. Without this, comparing a partial 2026
   against a complete 2025 makes every account look like it's collapsing. */

const YTD_FROM_YEAR = 2023;

const EMPTY_YTD = {
  ytd_2023: 0,
  ytd_2024: 0,
  ytd_2025: 0,
  ytd_2026: 0,
};

type YtdBuckets = typeof EMPTY_YTD;

/** Chunked so a large agency's customer list can't overflow the request URL. */
const ID_CHUNK = 200;

async function ytdByCustomer(ids: string[]): Promise<{
  byCustomer: Map<string, YtdBuckets>;
  throughLabel: string;
}> {
  const now = new Date();
  // Compare month/day as a single number so leap years need no special case.
  const cutoff = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const throughLabel = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const byCustomer = new Map<string, YtdBuckets>();
  if (ids.length === 0) return { byCustomer, throughLabel };

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    const { data: orders, error } = await supabaseServer
      .from("sales_orders_raw")
      .select("customerid, datecompleted, totalprice")
      .in("customerid", slice)
      .gte("datecompleted", `${YTD_FROM_YEAR}-01-01`)
      .not("datecompleted", "is", null);

    // Non-fatal: the list still renders, just without YTD figures.
    if (error) continue;

    for (const o of (orders ?? []) as {
      customerid: string | null;
      datecompleted: string | null;
      totalprice: number | null;
    }[]) {
      if (!o.customerid || !o.datecompleted) continue;
      const d = new Date(o.datecompleted);
      if (Number.isNaN(d.getTime())) continue;

      const year = d.getUTCFullYear();
      const key = `ytd_${year}` as keyof YtdBuckets;
      if (!(key in EMPTY_YTD)) continue;

      const stamp = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
      if (stamp > cutoff) continue; // past today's date in that year

      const entry = byCustomer.get(o.customerid) ?? { ...EMPTY_YTD };
      entry[key] += o.totalprice ?? 0;
      byCustomer.set(o.customerid, entry);
    }
  }

  return { byCustomer, throughLabel };
}
