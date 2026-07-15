import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";

/**
 * Storefront web analytics. Reads the wholesale project's analytics_events
 * (the storefronts beacon into it via their own /api/track), aggregates a
 * recent window in-memory, and hands the dashboard ready-to-render rollups.
 *
 * The table doesn't exist until supabase/analytics.sql is run on the wholesale
 * project, so a missing table reports notReady — the page then shows an honest
 * "not collecting yet" state instead of an error.
 *
 * Aggregating in-memory (not SQL) mirrors the Purchases route: at current
 * storefront volume the recent window is small. If it grows, move these
 * rollups into a Postgres function / materialized view.
 */

type EventRow = {
  created_at: string;
  store: string | null;
  visitor_id: string;
  session_id: string;
  event_type: "pageview" | "engaged" | "click" | string;
  path: string | null;
  referrer: string | null;
  button_id: string | null;
  label: string | null;
  dwell_ms: number | null;
  device: string | null;
  country: string | null;
};

const MAX_ROWS = 50_000;

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD (UTC)
}

function referrerSource(ref: string | null): string | null {
  if (!ref) return null;
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Top-N of a label→count map, as sorted [{ key, label, count }]. */
function topN(
  counts: Map<string, { label: string | null; count: number }>,
  n: number,
) {
  return [...counts.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Wholesale project isn't connected — add WHOLESALE_SUPABASE_URL + WHOLESALE_SUPABASE_SERVICE_ROLE_KEY to .env.local.",
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 90);
  const store = url.searchParams.get("store"); // optional 'sassy' | 'ni'
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = admin
    .from("analytics_events")
    .select(
      "created_at, store, visitor_id, session_id, event_type, path, referrer, button_id, label, dwell_ms, device, country",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (store) query = query.eq("store", store);

  const { data, error } = await query;

  if (error) {
    if (/schema cache|does not exist|relation/i.test(error.message)) {
      return NextResponse.json({ notReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as EventRow[];

  // ---- rollups ----
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  let pageviews = 0;
  let clicks = 0;
  let engaged = 0;
  let dwellSum = 0;

  const perDay = new Map<string, { pageviews: number; visitors: Set<string> }>();
  const pages = new Map<string, { label: string | null; count: number }>();
  const buttons = new Map<string, { label: string | null; count: number }>();
  const devices = new Map<string, number>();
  const referrers = new Map<string, { label: string | null; count: number }>();

  // Seed every day in the window so the chart has a continuous axis.
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000).toISOString());
    perDay.set(key, { pageviews: 0, visitors: new Set() });
  }

  for (const r of rows) {
    visitors.add(r.visitor_id);
    sessions.add(r.session_id);
    const day = perDay.get(dayKey(r.created_at));

    if (r.event_type === "pageview") {
      pageviews++;
      if (day) {
        day.pageviews++;
        day.visitors.add(r.visitor_id);
      }
      if (r.path) {
        const e = pages.get(r.path) ?? { label: null, count: 0 };
        e.count++;
        pages.set(r.path, e);
      }
      if (r.device) devices.set(r.device, (devices.get(r.device) ?? 0) + 1);
      const src = referrerSource(r.referrer);
      if (src) {
        const e = referrers.get(src) ?? { label: null, count: 0 };
        e.count++;
        referrers.set(src, e);
      }
    } else if (r.event_type === "click") {
      clicks++;
      const id = r.button_id ?? "(unknown)";
      const e = buttons.get(id) ?? { label: r.label, count: 0 };
      e.count++;
      if (!e.label && r.label) e.label = r.label;
      buttons.set(id, e);
    } else if (r.event_type === "engaged") {
      engaged++;
      if (typeof r.dwell_ms === "number") dwellSum += r.dwell_ms;
    }
  }

  // ---- checkouts + abandoned carts (orders table, same wholesale project) ----
  // A D2C order is created `unpaid` at checkout-start and flipped to `paid` by
  // the Stripe webhook, so an aged, still-unpaid, non-cancelled D2C order is an
  // abandoned cart. Wholesale orders are placed on terms (no Stripe payment at
  // checkout), so they count as completed regardless of payment_status.
  let checkoutsTotal = 0;
  let checkoutsRevenue = 0;
  let abandonedTotal = 0;
  let abandonedRevenue = 0;
  const checkoutsByDay = new Map<string, number>();
  for (const [date] of perDay) checkoutsByDay.set(date, 0);
  const abandonedBefore = Date.now() - 60 * 60 * 1000; // ≥1h old = not mid-checkout

  let ordersQuery = admin
    .from("orders")
    .select("created_at, total, status, payment_status, channel")
    .gte("created_at", since)
    .limit(MAX_ROWS);
  if (store) ordersQuery = ordersQuery.eq("store", store);
  const { data: orderRows } = await ordersQuery;
  for (const o of (orderRows ?? []) as {
    created_at: string;
    total: number | null;
    status: string | null;
    payment_status: string | null;
    channel: string | null;
  }[]) {
    if (o.status === "cancelled") continue;
    const completed = o.channel !== "d2c" || o.payment_status === "paid";
    if (completed) {
      checkoutsTotal++;
      checkoutsRevenue += Number(o.total) || 0;
      const k = dayKey(o.created_at);
      if (checkoutsByDay.has(k)) checkoutsByDay.set(k, (checkoutsByDay.get(k) ?? 0) + 1);
    } else if (
      o.channel === "d2c" &&
      o.payment_status === "unpaid" &&
      new Date(o.created_at).getTime() < abandonedBefore
    ) {
      abandonedTotal++;
      abandonedRevenue += Number(o.total) || 0;
    }
  }

  const byDay = [...perDay.entries()].map(([date, v]) => ({
    date,
    pageviews: v.pageviews,
    visitors: v.visitors.size,
    checkouts: checkoutsByDay.get(date) ?? 0,
  }));

  return NextResponse.json({
    notReady: false,
    range: { days, since },
    capped: rows.length >= MAX_ROWS,
    checkouts: {
      total: checkoutsTotal,
      revenue: Math.round(checkoutsRevenue * 100) / 100,
    },
    abandoned: {
      total: abandonedTotal,
      revenue: Math.round(abandonedRevenue * 100) / 100,
    },
    totals: {
      pageviews,
      uniqueVisitors: visitors.size,
      sessions: sessions.size,
      clicks,
      engaged,
      avgDwellMs: engaged ? Math.round(dwellSum / engaged) : 0,
      engagedRate: pageviews ? engaged / pageviews : 0,
    },
    byDay,
    topPages: topN(pages, 12),
    topButtons: topN(buttons, 12),
    devices: [...devices.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    topReferrers: topN(referrers, 8),
  });
}
