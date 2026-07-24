import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/portal/sales-hub
 *
 * The rep's own book, shaped for selling rather than reporting: which channels
 * they actually sell into (so the portal shows the USPs that match), which
 * accounts are slipping, and where the whitespace is.
 *
 * The internal Sales Hub answers "how is this channel doing for FMG". This
 * answers "what should *you* say, to *your* accounts, this week" — same
 * positioning content, ranked by the rep's own revenue.
 *
 * Agency always comes from the session (resolvePortalAgency), never the client.
 */

/** Slipping = no order in this many days, but not yet a full year gone. */
const AT_RISK_DAYS = 180;
const CHURN_DAYS = 365;

type CustomerRow = {
  customerid: string;
  name: string;
  channel: string | null;
  bill_to_state: string | null;
  last_order_date: string | null;
  lifetime_revenue: number | null;
  sales_2025: number | null;
  sales_2026: number | null;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agency = String(rep.agencyCode);

  const { data, error } = await supabaseServer
    .from("customer_summary")
    .select(
      "customerid, name, channel, bill_to_state, last_order_date, lifetime_revenue, sales_2025, sales_2026",
    )
    .eq("agency_code", agency);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customers = (data ?? []) as CustomerRow[];

  /* ── Channel mix ──
     Ranked by this year's revenue so the portal leads with the channels the
     rep actually sells, and can quietly drop the ones they don't. */
  const byChannel = new Map<
    string,
    {
      channel: string;
      customers: number;
      sales_2026: number;
      sales_2025: number;
      activeCustomers: number;
    }
  >();

  for (const c of customers) {
    const key = (c.channel ?? "").trim() || "UNCLASSIFIED";
    const entry =
      byChannel.get(key) ??
      { channel: key, customers: 0, sales_2026: 0, sales_2025: 0, activeCustomers: 0 };
    entry.customers += 1;
    entry.sales_2026 += c.sales_2026 ?? 0;
    entry.sales_2025 += c.sales_2025 ?? 0;
    const d = daysSince(c.last_order_date);
    if (d !== null && d <= AT_RISK_DAYS) entry.activeCustomers += 1;
    byChannel.set(key, entry);
  }

  const channels = [...byChannel.values()]
    .map((e) => ({
      ...e,
      variance: e.sales_2026 - e.sales_2025,
      variance_pct:
        e.sales_2025 > 0
          ? ((e.sales_2026 - e.sales_2025) / e.sales_2025) * 100
          : null,
    }))
    .sort((a, b) => b.sales_2026 - a.sales_2026);

  /* ── Accounts to call ──
     Slipping accounts, biggest first — the rep's version of the founder's
     "do today" list. Churned accounts are excluded: a year gone is a
     different (and much colder) conversation than a lapsing regular. */
  const slipping = customers
    .map((c) => {
      const days = daysSince(c.last_order_date);
      return { c, days };
    })
    .filter(
      ({ days }) => days !== null && days > AT_RISK_DAYS && days <= CHURN_DAYS,
    )
    .map(({ c, days }) => ({
      customerid: c.customerid,
      name: c.name,
      channel: c.channel,
      state: c.bill_to_state,
      days_since_order: days as number,
      last_order_date: c.last_order_date,
      /* What's on the table: last year's run rate, less whatever they've
         already bought this year. */
      at_stake: Math.max(0, (c.sales_2025 ?? 0) - (c.sales_2026 ?? 0)),
      sales_2025: c.sales_2025 ?? 0,
      sales_2026: c.sales_2026 ?? 0,
    }))
    .sort((a, b) => b.at_stake - a.at_stake)
    .slice(0, 10);

  /* ── Growing / declining ──
     Two short lists: who to thank and reorder, who to rescue. */
  const withVariance = customers
    .filter((c) => (c.sales_2025 ?? 0) > 0 || (c.sales_2026 ?? 0) > 0)
    .map((c) => ({
      customerid: c.customerid,
      name: c.name,
      channel: c.channel,
      sales_2025: c.sales_2025 ?? 0,
      sales_2026: c.sales_2026 ?? 0,
      variance: (c.sales_2026 ?? 0) - (c.sales_2025 ?? 0),
    }));

  const growing = [...withVariance]
    .filter((c) => c.variance > 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 5);

  const declining = [...withVariance]
    .filter((c) => c.variance < 0)
    .sort((a, b) => a.variance - b.variance)
    .slice(0, 5);

  const sales_2025 = customers.reduce((s, c) => s + (c.sales_2025 ?? 0), 0);
  const sales_2026 = customers.reduce((s, c) => s + (c.sales_2026 ?? 0), 0);

  return NextResponse.json({
    kpis: {
      customers: customers.length,
      sales_2025,
      sales_2026,
      variance: sales_2026 - sales_2025,
      variance_pct:
        sales_2025 > 0 ? ((sales_2026 - sales_2025) / sales_2025) * 100 : null,
      slippingCount: customers.filter((c) => {
        const d = daysSince(c.last_order_date);
        return d !== null && d > AT_RISK_DAYS && d <= CHURN_DAYS;
      }).length,
    },
    channels,
    slipping,
    growing,
    declining,
  });
}
