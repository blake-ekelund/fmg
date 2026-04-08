import { NextRequest, NextResponse } from "next/server";
import { getShopifyCredentials, shopifyFetch as shopifyApiFetch } from "@/lib/shopify";

let _creds: { store: string; token: string } | null = null;

function shopifyFetch(endpoint: string, params?: Record<string, string>) {
  if (!_creds) throw new Error("No credentials");
  return shopifyApiFetch(_creds, endpoint, params);
}

function isoDate(d: Date) {
  return d.toISOString();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * GET /api/shopify/analytics?period=7d|30d|90d|ytd
 *
 * Returns aggregated Shopify store analytics:
 * - Orders summary (count, revenue, AOV)
 * - Abandoned checkouts
 * - Customer stats
 * - Top products
 * - Recent orders
 * - Discount code usage
 */
export async function GET(req: NextRequest) {
  _creds = await getShopifyCredentials();
  if (!_creds) {
    return NextResponse.json({
      connected: false,
      error: "Shopify not configured",
    }, { status: 422 });
  }

  const period = req.nextUrl.searchParams.get("period") || "30d";

  // Calculate date range
  const now = new Date();
  let sinceDate: Date;
  switch (period) {
    case "7d":
      sinceDate = new Date(now.getTime() - 7 * 86400000);
      break;
    case "90d":
      sinceDate = new Date(now.getTime() - 90 * 86400000);
      break;
    case "ytd":
      sinceDate = new Date(now.getFullYear(), 0, 1);
      break;
    case "30d":
    default:
      sinceDate = new Date(now.getTime() - 30 * 86400000);
      break;
  }

  const since = isoDate(startOfDay(sinceDate));
  const priorStart = isoDate(
    new Date(sinceDate.getTime() - (now.getTime() - sinceDate.getTime()))
  );
  const priorEnd = since;

  try {
    // Fetch all data in parallel
    const [
      ordersRes,
      priorOrdersRes,
      abandonedRes,
      customersRes,
      priorCustomersRes,
      productsRes,
    ] = await Promise.all([
      // Current period orders
      shopifyFetch("/orders.json", {
        status: "any",
        created_at_min: since,
        limit: "250",
        fields: "id,name,created_at,total_price,financial_status,fulfillment_status,customer,discount_codes,line_items,cancelled_at,cart_token,referring_site",
      }),
      // Prior period orders (for comparison)
      shopifyFetch("/orders.json", {
        status: "any",
        created_at_min: priorStart,
        created_at_max: priorEnd,
        limit: "250",
        fields: "id,total_price,financial_status,cancelled_at",
      }),
      // Abandoned checkouts
      shopifyFetch("/checkouts.json", {
        created_at_min: since,
        limit: "250",
      }),
      // New customers
      shopifyFetch("/customers.json", {
        created_at_min: since,
        limit: "250",
        fields: "id,email,first_name,last_name,orders_count,total_spent,created_at,tags",
      }),
      // Prior customers
      shopifyFetch("/customers.json", {
        created_at_min: priorStart,
        created_at_max: priorEnd,
        limit: "250",
        fields: "id",
      }),
      // Top products
      shopifyFetch("/products.json", {
        limit: "50",
        fields: "id,title,variants,image",
      }),
    ]);

    const [orders, priorOrders, abandoned, customers, priorCustomers, products] = await Promise.all([
      ordersRes.ok ? ordersRes.json() : { orders: [] },
      priorOrdersRes.ok ? priorOrdersRes.json() : { orders: [] },
      abandonedRes.ok ? abandonedRes.json() : { checkouts: [] },
      customersRes.ok ? customersRes.json() : { customers: [] },
      priorCustomersRes.ok ? priorCustomersRes.json() : { customers: [] },
      productsRes.ok ? productsRes.json() : { products: [] },
    ]);

    const ordersList = orders.orders || [];
    const priorOrdersList = priorOrders.orders || [];
    const abandonedList = abandoned.checkouts || [];
    const customersList = customers.customers || [];
    const priorCustomersList = priorCustomers.customers || [];

    // ─── Orders Analytics ───
    const completedOrders = ordersList.filter((o: any) => !o.cancelled_at);
    const priorCompleted = priorOrdersList.filter((o: any) => !o.cancelled_at);

    const totalRevenue = completedOrders.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0);
    const priorRevenue = priorCompleted.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0);
    const totalOrders = completedOrders.length;
    const priorTotalOrders = priorCompleted.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const priorAOV = priorTotalOrders > 0 ? priorRevenue / priorTotalOrders : 0;

    // Fulfillment breakdown
    const fulfilled = completedOrders.filter((o: any) => o.fulfillment_status === "fulfilled").length;
    const unfulfilled = completedOrders.filter((o: any) => !o.fulfillment_status || o.fulfillment_status === null).length;
    const partiallyFulfilled = completedOrders.filter((o: any) => o.fulfillment_status === "partial").length;

    // Payment status
    const paid = completedOrders.filter((o: any) => o.financial_status === "paid").length;
    const pending = completedOrders.filter((o: any) => o.financial_status === "pending").length;
    const refunded = ordersList.filter((o: any) => o.financial_status === "refunded").length;
    const cancelledOrders = ordersList.filter((o: any) => o.cancelled_at).length;

    // ─── Daily revenue for chart ───
    const dailyMap: Record<string, { revenue: number; orders: number }> = {};
    completedOrders.forEach((o: any) => {
      const day = o.created_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { revenue: 0, orders: 0 };
      dailyMap[day].revenue += parseFloat(o.total_price || "0");
      dailyMap[day].orders += 1;
    });
    const dailyRevenue = Object.entries(dailyMap)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ─── Abandoned Checkouts ───
    const abandonedCount = abandonedList.length;
    const abandonedValue = abandonedList.reduce(
      (s: number, c: any) => s + parseFloat(c.total_price || "0"),
      0
    );
    // Recovery: checkouts that were completed (have completed_at)
    const recoveredCheckouts = abandonedList.filter((c: any) => c.completed_at);
    const recoveredValue = recoveredCheckouts.reduce(
      (s: number, c: any) => s + parseFloat(c.total_price || "0"),
      0
    );
    const recoveryRate = abandonedCount > 0 ? (recoveredCheckouts.length / abandonedCount) * 100 : 0;

    // Abandoned cart details (most recent 20)
    const abandonedCarts = abandonedList
      .filter((c: any) => !c.completed_at)
      .slice(0, 20)
      .map((c: any) => ({
        id: c.id,
        email: c.email || null,
        total: parseFloat(c.total_price || "0"),
        items: (c.line_items || []).length,
        item_names: (c.line_items || []).map((li: any) => li.title).slice(0, 3),
        created_at: c.created_at,
        abandoned_url: c.abandoned_checkout_url || null,
        recovery_sent: c.buyer_accepts_marketing || false,
      }));

    // ─── Customer Analytics ───
    const newCustomers = customersList.length;
    const priorNewCustomers = priorCustomersList.length;
    const returningOrders = completedOrders.filter(
      (o: any) => o.customer && o.customer.orders_count > 1
    ).length;
    const newCustomerOrders = completedOrders.filter(
      (o: any) => o.customer && o.customer.orders_count === 1
    ).length;
    const repeatRate = totalOrders > 0 ? (returningOrders / totalOrders) * 100 : 0;

    // Top customers by spend
    const customerSpend: Record<string, { email: string; name: string; spent: number; orders: number }> = {};
    completedOrders.forEach((o: any) => {
      if (!o.customer?.email) return;
      const key = o.customer.email;
      if (!customerSpend[key]) {
        customerSpend[key] = {
          email: key,
          name: [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ") || key,
          spent: 0,
          orders: 0,
        };
      }
      customerSpend[key].spent += parseFloat(o.total_price || "0");
      customerSpend[key].orders += 1;
    });
    const topCustomers = Object.values(customerSpend)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10);

    // ─── Top Products ───
    const productSales: Record<string, { title: string; quantity: number; revenue: number; image: string | null }> = {};
    completedOrders.forEach((o: any) => {
      (o.line_items || []).forEach((li: any) => {
        const pid = String(li.product_id);
        if (!productSales[pid]) {
          productSales[pid] = { title: li.title || li.name || "Unknown", quantity: 0, revenue: 0, image: null };
        }
        productSales[pid].quantity += li.quantity || 1;
        productSales[pid].revenue += parseFloat(li.price || "0") * (li.quantity || 1);
      });
    });
    // Add images from products list
    (products.products || []).forEach((p: any) => {
      const pid = String(p.id);
      if (productSales[pid] && p.image?.src) {
        productSales[pid].image = p.image.src;
      }
    });
    const topProducts = Object.entries(productSales)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ─── Discount Usage ───
    const discountUsage: Record<string, { code: string; uses: number; total_discount: number }> = {};
    completedOrders.forEach((o: any) => {
      (o.discount_codes || []).forEach((dc: any) => {
        const code = dc.code?.toUpperCase();
        if (!code) return;
        if (!discountUsage[code]) {
          discountUsage[code] = { code, uses: 0, total_discount: 0 };
        }
        discountUsage[code].uses += 1;
        discountUsage[code].total_discount += parseFloat(dc.amount || "0");
      });
    });
    const discountCodes = Object.values(discountUsage)
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 10);

    // ─── Traffic Sources ───
    const sourceMap: Record<string, number> = {};
    completedOrders.forEach((o: any) => {
      const src = o.referring_site || "Direct";
      const domain = src === "Direct" ? "Direct" : (() => {
        try { return new URL(src).hostname; } catch { return src; }
      })();
      sourceMap[domain] = (sourceMap[domain] || 0) + 1;
    });
    const trafficSources = Object.entries(sourceMap)
      .map(([source, orders]) => ({ source, orders }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10);

    // ─── Recent Orders ───
    const recentOrders = completedOrders.slice(0, 15).map((o: any) => ({
      id: o.id,
      name: o.name,
      total: parseFloat(o.total_price || "0"),
      financial_status: o.financial_status,
      fulfillment_status: o.fulfillment_status || "unfulfilled",
      customer_name: o.customer
        ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ")
        : "Guest",
      customer_email: o.customer?.email || null,
      items: (o.line_items || []).length,
      created_at: o.created_at,
      discount_codes: (o.discount_codes || []).map((d: any) => d.code),
    }));

    // ─── Percentage Changes ───
    function pctChange(curr: number, prev: number): number | null {
      if (prev === 0) return curr > 0 ? 100 : null;
      return ((curr - prev) / prev) * 100;
    }

    return NextResponse.json({
      connected: true,
      period,
      date_range: { from: since, to: isoDate(now) },

      summary: {
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        avg_order_value: avgOrderValue,
        orders_change: pctChange(totalOrders, priorTotalOrders),
        revenue_change: pctChange(totalRevenue, priorRevenue),
        aov_change: pctChange(avgOrderValue, priorAOV),
      },

      fulfillment: { fulfilled, unfulfilled, partially_fulfilled: partiallyFulfilled },
      payments: { paid, pending, refunded, cancelled: cancelledOrders },

      abandoned_checkouts: {
        count: abandonedCount,
        total_value: abandonedValue,
        recovered_count: recoveredCheckouts.length,
        recovered_value: recoveredValue,
        recovery_rate: recoveryRate,
        carts: abandonedCarts,
      },

      customers: {
        new_customers: newCustomers,
        new_customers_change: pctChange(newCustomers, priorNewCustomers),
        new_customer_orders: newCustomerOrders,
        returning_orders: returningOrders,
        repeat_rate: repeatRate,
        top_customers: topCustomers,
      },

      daily_revenue: dailyRevenue,
      top_products: topProducts,
      discount_codes: discountCodes,
      traffic_sources: trafficSources,
      recent_orders: recentOrders,
    });
  } catch (e) {
    console.error("Shopify analytics error:", e);
    return NextResponse.json(
      { connected: true, error: String(e) },
      { status: 500 }
    );
  }
}
