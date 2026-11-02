import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/support/conversions?store=all|sassy|ni&days=30
 *
 * Is the concierge selling? For chats started in the window: how many led to
 * an "add to bag" tap on something the concierge offered, and how many were
 * followed by an order in the same browser visit (stamped by the storefronts
 * — see support_conversation_conversions). Paid vs unpaid is read from the
 * order itself, so an abandoned Stripe checkout doesn't count as revenue.
 *
 * Kept apart from the inbox list on purpose: until the conversions migration
 * runs, this answers `ready: false` and the inbox carries on untouched.
 */

type Row = {
  id: string;
  store: string;
  bag_adds: number;
  bag_add_value: number | string;
  order_id: string | null;
  order_number: number | null;
  order_total: number | string | null;
};

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const store = params.get("store") ?? "all";
  const days = Math.min(Math.max(Number(params.get("days")) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = supabaseServer
    .from("support_conversations")
    .select("id, store, bag_adds, bag_add_value, order_id, order_number, order_total")
    .gte("created_at", since)
    .limit(5000);
  if (store === "sassy" || store === "ni") query = query.eq("store", store);

  const { data, error } = await query;
  if (error) {
    // The columns aren't there yet: say so, don't fail the page.
    if (/bag_adds|order_id|column .* does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({ ready: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as Row[];

  // Which attributed orders actually got paid.
  const orderIds = rows.map((r) => r.order_id).filter(Boolean) as string[];
  const paid = new Set<string>();
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data: orders } = await supabaseServer
      .from("orders")
      .select("id, payment_status")
      .in("id", orderIds.slice(i, i + 200));
    for (const o of orders ?? []) {
      if (o.payment_status === "paid") paid.add(o.id as string);
    }
  }

  const money = (v: number | string | null) => Number(v ?? 0) || 0;
  const withAdd = rows.filter((r) => r.bag_adds > 0);
  const withOrder = rows.filter((r) => r.order_id);
  const paidRows = withOrder.filter((r) => paid.has(r.order_id as string));

  const byId: Record<string, { bagAdds: number; orderNumber: number | null; paid: boolean }> = {};
  for (const r of rows) {
    if (r.bag_adds > 0 || r.order_id) {
      byId[r.id] = {
        bagAdds: r.bag_adds,
        orderNumber: r.order_number,
        paid: r.order_id ? paid.has(r.order_id) : false,
      };
    }
  }

  return NextResponse.json({
    ready: true,
    days,
    summary: {
      chats: rows.length,
      chatsWithAdd: withAdd.length,
      addValue: Math.round(withAdd.reduce((s, r) => s + money(r.bag_add_value), 0) * 100) / 100,
      orders: withOrder.length,
      paidOrders: paidRows.length,
      paidRevenue: Math.round(paidRows.reduce((s, r) => s + money(r.order_total), 0) * 100) / 100,
    },
    byId,
  });
}
