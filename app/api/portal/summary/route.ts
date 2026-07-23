import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/portal/summary — dashboard data for the signed-in rep, scoped to
 * their own agency. YoY comes from the pre-aggregated customer_summary columns;
 * the month-by-month trend is aggregated from sales_orders_raw over the agency's
 * customer set. Agency is taken from the profile (requireRep) — never the client.
 */
export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agency = String(rep.agencyCode);

  // 1. Agency customers (pre-aggregated yearly sales).
  const { data: custData, error: custErr } = await supabaseServer
    .from("customer_summary")
    .select(
      "customerid, name, bill_to_state, last_order_date, last_order_amount, sales_2025, sales_2026",
    )
    .eq("agency_code", agency);

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }

  const customers = (custData ?? []) as {
    customerid: string;
    name: string;
    bill_to_state: string | null;
    last_order_date: string | null;
    last_order_amount: number | null;
    sales_2025: number | null;
    sales_2026: number | null;
  }[];

  const sales_2025 = customers.reduce((s, c) => s + (c.sales_2025 ?? 0), 0);
  const sales_2026 = customers.reduce((s, c) => s + (c.sales_2026 ?? 0), 0);
  const variance = sales_2026 - sales_2025;
  const variance_pct =
    sales_2025 > 0 ? (variance / sales_2025) * 100 : sales_2026 > 0 ? 100 : 0;

  const topCustomers = [...customers]
    .sort((a, b) => (b.sales_2026 ?? 0) - (a.sales_2026 ?? 0))
    .slice(0, 8)
    .map((c) => ({
      customerid: c.customerid,
      name: c.name,
      state: c.bill_to_state,
      sales_2026: c.sales_2026 ?? 0,
      sales_2025: c.sales_2025 ?? 0,
      last_order_date: c.last_order_date,
    }));

  // 2. Month-by-month wholesale trend from raw orders over the agency's customers.
  const ids = customers.map((c) => c.customerid).filter(Boolean);
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    sales_2025: 0,
    sales_2026: 0,
  }));

  if (ids.length > 0) {
    // Chunk the IN() filter so very large agencies don't overflow the URL.
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: orders, error: ordErr } = await supabaseServer
        .from("sales_orders_raw")
        .select("datecompleted, totalprice")
        .in("customerid", slice)
        .not("datecompleted", "is", null);

      if (ordErr) {
        return NextResponse.json({ error: ordErr.message }, { status: 500 });
      }

      for (const o of (orders ?? []) as {
        datecompleted: string | null;
        totalprice: number | null;
      }[]) {
        if (!o.datecompleted) continue;
        const d = new Date(o.datecompleted);
        const yr = d.getUTCFullYear();
        const m = d.getUTCMonth(); // 0-based
        if (m < 0 || m > 11) continue;
        if (yr === 2025) monthly[m].sales_2025 += o.totalprice ?? 0;
        else if (yr === 2026) monthly[m].sales_2026 += o.totalprice ?? 0;
      }
    }
  }

  return NextResponse.json({
    kpis: {
      customers: customers.length,
      sales_2025,
      sales_2026,
      variance,
      variance_pct,
    },
    monthly,
    topCustomers,
  });
}
