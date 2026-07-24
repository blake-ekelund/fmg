import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { fetchOpenOrderCustomerIds } from "@/lib/orderStage";

export const runtime = "nodejs";

/** Recency thresholds (days) for account health — mirror the customers list. */
const ACTIVE_DAYS = 180;
const CHURN_DAYS = 365;

type Status = "active" | "at_risk" | "churned" | "none";

function classify(lastOrder: string | null, hasOpenOrder: boolean): Status {
  // A live estimate or in-flight order means the account is still trading.
  if (hasOpenOrder) return "active";
  if (!lastOrder) return "none";
  const t = new Date(lastOrder).getTime();
  if (Number.isNaN(t)) return "none";
  const days = (Date.now() - t) / 86_400_000;
  if (days <= ACTIVE_DAYS) return "active";
  if (days <= CHURN_DAYS) return "at_risk";
  return "churned";
}

/**
 * GET /api/portal/summary — dashboard data for the signed-in rep, scoped to
 * their own agency. Agency is taken from the profile — never the client.
 *
 * Two different sales comparisons, deliberately:
 *   • 2026 YTD vs 2025 YTD — the apples-to-apples read (same Jan 1→today window).
 *   • 2026 YTD vs full-year 2025 — how far along the rep is toward last year's
 *     total. Both matter; showing only one misleads.
 * 2025 YTD has no pre-aggregated column, so it's summed from sales_orders_raw
 * with a month/day cutoff (same technique as the customers-list YTD toggle).
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

  // Account-health breakdown. Customers with a live estimate/in-flight order
  // count as active regardless of how old their last completed order is.
  const openIds = await fetchOpenOrderCustomerIds(supabaseServer, {
    customerIds: customers.map((c) => c.customerid).filter(Boolean),
  });
  const health = { active: 0, at_risk: 0, churned: 0, none: 0 };
  for (const c of customers) {
    health[classify(c.last_order_date, openIds.has(c.customerid))] += 1;
  }

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

  /* Same-window YTD: everything from Jan 1 up to today's month/day, for each
     year. Compared as month*100+day so leap years need no special case. This is
     the ONLY apples-to-apples read of 2025 vs 2026 — full-year 2025 flatters
     the comparison because 2026 isn't finished. */
  const now = new Date();
  const cutoff = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const ytdThrough = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  let sales_2025_ytd = 0;
  let sales_2026_ytd = 0;

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
        const amt = o.totalprice ?? 0;
        if (yr === 2025) monthly[m].sales_2025 += amt;
        else if (yr === 2026) monthly[m].sales_2026 += amt;

        const stamp = (m + 1) * 100 + d.getUTCDate();
        if (stamp <= cutoff) {
          if (yr === 2025) sales_2025_ytd += amt;
          else if (yr === 2026) sales_2026_ytd += amt;
        }
      }
    }
  }

  /* 2026 YTD is compared two ways on the dashboard:
     • vs 2025 YTD — same window, the honest change.
     • vs full-year 2025 — pacing toward last year's total.
     Headline 2026 is `sales_2026` (the customer_summary aggregate the rest of
     the app shows) — and since 2026 isn't over, that value IS 2026-to-date. The
     YTD delta is computed from it (not the raw-order `sales_2026_ytd`) so the
     card's own arithmetic reconciles: headline − comparison = delta. 2025 YTD
     has no aggregate column, so it's the raw-order sum. */
  const ytd_variance = sales_2026 - sales_2025_ytd;
  const ytd_variance_pct =
    sales_2025_ytd > 0
      ? (ytd_variance / sales_2025_ytd) * 100
      : sales_2026 > 0
        ? 100
        : 0;
  // 2026-so-far as a share of last year's full total (pacing).
  const pct_of_2025 = sales_2025 > 0 ? (sales_2026 / sales_2025) * 100 : null;

  return NextResponse.json({
    kpis: {
      customers: customers.length,
      // Account-health split of the customer count.
      active: health.active,
      at_risk: health.at_risk,
      churned: health.churned,
      no_orders: health.none,
      // Sales.
      sales_2025, // full-year 2025
      sales_2026, // 2026 YTD (year isn't over) — the headline figure
      sales_2025_ytd, // 2025 through the same date as today
      sales_2026_ytd, // raw-order 2026 YTD (backs the YTD comparison)
      variance, // sales_2026 − full-year 2025
      variance_pct,
      ytd_variance, // 2026 YTD − 2025 YTD (apples-to-apples)
      ytd_variance_pct,
      pct_of_2025, // 2026 YTD as % of full-year 2025 (pacing)
      ytd_through: ytdThrough, // e.g. "Jul 24"
    },
    monthly,
    topCustomers,
  });
}
