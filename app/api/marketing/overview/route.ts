import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function pctChange(current: number, prior: number) {
  if (!prior) return null;
  return (current - prior) / prior;
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  // --- Shopify: current 30 days ---
  const { data: currentRows } = await supabase
    .from("shopify_daily_metrics")
    .select("total_orders, total_amount_spent, sessions")
    .gte("day", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
    .lt("day", today);

  // --- Shopify: prior 30 days ---
  const { data: priorRows } = await supabase
    .from("shopify_daily_metrics")
    .select("total_orders, total_amount_spent, sessions")
    .gte("day", new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10))
    .lt("day", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));

  const sum = (rows: any[]) =>
    rows.reduce(
      (acc, r) => {
        acc.orders += r.total_orders ?? 0;
        acc.revenue += Number(r.total_amount_spent ?? 0);
        acc.sessions += r.sessions ?? 0;
        return acc;
      },
      { orders: 0, revenue: 0, sessions: 0 }
    );

  const current = sum(currentRows ?? []);
  const prior = sum(priorRows ?? []);

  const shopify = {
    current: {
      sessions: current.sessions,
      orders: current.orders,
      revenue: current.revenue,
      aov:
        current.orders > 0
          ? current.revenue / current.orders
          : 0,
      conversion:
        current.sessions > 0
          ? current.orders / current.sessions
          : 0,
    },
    delta: {
      sessions: pctChange(current.sessions, prior.sessions),
      orders: pctChange(current.orders, prior.orders),
      revenue: pctChange(current.revenue, prior.revenue),
      aov: pctChange(
        current.revenue / Math.max(current.orders, 1),
        prior.revenue / Math.max(prior.orders, 1)
      ),
      conversion: pctChange(
        current.orders / Math.max(current.sessions, 1),
        prior.orders / Math.max(prior.sessions, 1)
      ),
    },
  };

  // --- Upcoming content: next 7 days ---
  const { data: upcomingContent } = await supabase
    .from("marketing_content")
    .select("publish_date, platform, content_type, description, status")
    .gte("publish_date", today)
    .lte(
      "publish_date",
      new Date(Date.now() + 7 * 864e5)
        .toISOString()
        .slice(0, 10)
    )
    .order("publish_date", { ascending: true });

  return NextResponse.json({
    shopify,
    upcomingContent: upcomingContent ?? [],
  });
}
