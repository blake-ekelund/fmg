import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Resolve date bounds based on range
 */
function getDateBounds(range: string | null) {
  const now = new Date();

  let start: Date | null = null;
  let end: Date | null = null;

  switch (range) {
    case "current_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;

    case "last_month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    case "this_year":
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
      break;

    case "last_year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear(), 0, 1);
      break;

    default:
      // no filtering
      break;
  }

  return { start, end };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range");

  const { start, end } = getDateBounds(range);

  let query = supabase
    .from("shopify_daily_metrics")
    .select(`
      total_orders,
      total_amount_spent,
      online_store_visitors,
      sessions,
      sessions_reached_checkout,
      total_shipping_charges
    `);

  if (start) {
    query = query.gte("day", start.toISOString().slice(0, 10));
  }

  if (end) {
    query = query.lt("day", end.toISOString().slice(0, 10));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ data: null });
  }

  const totals = data.reduce(
    (acc, row) => {
      acc.total_orders += row.total_orders ?? 0;
      acc.total_amount_spent += Number(row.total_amount_spent ?? 0);
      acc.online_store_visitors += row.online_store_visitors ?? 0;
      acc.sessions += row.sessions ?? 0;
      acc.sessions_reached_checkout += row.sessions_reached_checkout ?? 0;
      acc.total_shipping_charges += Number(row.total_shipping_charges ?? 0);
      return acc;
    },
    {
      total_orders: 0,
      total_amount_spent: 0,
      online_store_visitors: 0,
      sessions: 0,
      sessions_reached_checkout: 0,
      total_shipping_charges: 0,
    }
  );

  const total_amount_spent_per_order =
    totals.total_orders > 0
      ? totals.total_amount_spent / totals.total_orders
      : 0;

  const conversion_rate =
    totals.sessions > 0
      ? totals.total_orders / totals.sessions
      : 0;

  return NextResponse.json({
    data: {
      ...totals,
      total_amount_spent_per_order,
      conversion_rate,
    },
  });
}
