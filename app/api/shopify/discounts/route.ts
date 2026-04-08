import { NextRequest, NextResponse } from "next/server";
import { getShopifyCredentials, shopifyFetch } from "@/lib/shopify";

/**
 * GET /api/shopify/discounts
 * Fetches all price rules + discount codes from Shopify with usage stats
 */
export async function GET(req: NextRequest) {
  const creds = await getShopifyCredentials();
  if (!creds) {
    return NextResponse.json({ connected: false, error: "Shopify not configured" }, { status: 422 });
  }

  try {
    // Fetch price rules (Shopify's discount mechanism)
    const priceRulesRes = await shopifyFetch(creds, "/price_rules.json", { limit: "250" });
    if (!priceRulesRes.ok) {
      const err = await priceRulesRes.text();
      console.error("Shopify price_rules error:", err);
      return NextResponse.json({ connected: true, error: "Failed to fetch price rules" }, { status: 502 });
    }

    const { price_rules: priceRules } = await priceRulesRes.json();

    // Fetch discount codes for each price rule (in parallel, batched)
    const discountsWithCodes = await Promise.all(
      (priceRules || []).map(async (pr: any) => {
        let codes: any[] = [];
        try {
          const codesRes = await shopifyFetch(creds, `/price_rules/${pr.id}/discount_codes.json`, { limit: "50" });
          if (codesRes.ok) {
            const data = await codesRes.json();
            codes = data.discount_codes || [];
          }
        } catch {
          // Skip if codes fetch fails
        }

        // Determine discount type and value
        let discountType = "percentage";
        let discountValue = 0;
        if (pr.target_type === "shipping_line") {
          discountType = "free_shipping";
          discountValue = 100;
        } else if (pr.value_type === "percentage") {
          discountType = "percentage";
          discountValue = Math.abs(parseFloat(pr.value || "0"));
        } else if (pr.value_type === "fixed_amount") {
          discountType = "fixed_amount";
          discountValue = Math.abs(parseFloat(pr.value || "0"));
        }

        // Determine status
        let status = "active";
        const now = new Date();
        const startsAt = pr.starts_at ? new Date(pr.starts_at) : null;
        const endsAt = pr.ends_at ? new Date(pr.ends_at) : null;

        if (endsAt && endsAt < now) {
          status = "expired";
        } else if (startsAt && startsAt > now) {
          status = "scheduled";
        }

        // Sum up usage across all codes
        const totalUsage = codes.reduce((sum: number, c: any) => sum + (c.usage_count || 0), 0);

        return {
          id: String(pr.id),
          shopify_id: String(pr.id),
          title: pr.title,
          discount_type: discountType,
          discount_value: discountValue,
          value_type: pr.value_type,
          target_type: pr.target_type,
          target_selection: pr.target_selection,
          allocation_method: pr.allocation_method,
          customer_selection: pr.customer_selection,
          once_per_customer: pr.once_per_customer || false,
          usage_limit: pr.usage_limit,
          starts_at: pr.starts_at,
          ends_at: pr.ends_at,
          status,
          created_at: pr.created_at,
          updated_at: pr.updated_at,

          // Minimum requirements
          min_subtotal: pr.prerequisite_subtotal_range?.greater_than_or_equal_to
            ? parseFloat(pr.prerequisite_subtotal_range.greater_than_or_equal_to)
            : null,
          min_quantity: pr.prerequisite_quantity_range?.greater_than_or_equal_to
            ? parseInt(pr.prerequisite_quantity_range.greater_than_or_equal_to)
            : null,

          // Codes & usage
          codes: codes.map((c: any) => ({
            id: c.id,
            code: c.code,
            usage_count: c.usage_count || 0,
            created_at: c.created_at,
          })),
          total_usage: totalUsage,
          primary_code: codes.length > 0 ? codes[0].code : null,
        };
      })
    );

    // Now fetch recent orders that used discount codes to calculate revenue impact
    const recentOrdersRes = await shopifyFetch(creds, "/orders.json", {
      status: "any",
      limit: "250",
      fields: "id,total_price,total_discounts,discount_codes,created_at,financial_status,cancelled_at",
    });

    let discountPerformance: Record<string, { orders: number; revenue: number; total_discount: number }> = {};

    if (recentOrdersRes.ok) {
      const { orders } = await recentOrdersRes.json();
      (orders || []).forEach((o: any) => {
        if (o.cancelled_at) return;
        (o.discount_codes || []).forEach((dc: any) => {
          const code = dc.code?.toUpperCase();
          if (!code) return;
          if (!discountPerformance[code]) {
            discountPerformance[code] = { orders: 0, revenue: 0, total_discount: 0 };
          }
          discountPerformance[code].orders += 1;
          discountPerformance[code].revenue += parseFloat(o.total_price || "0");
          discountPerformance[code].total_discount += parseFloat(dc.amount || "0");
        });
      });
    }

    // Attach performance data to each discount
    const enriched = discountsWithCodes.map((d) => {
      const codePerf: Record<string, { orders: number; revenue: number; total_discount: number }> = {};
      let totalOrders = 0;
      let totalRevenue = 0;
      let totalDiscountGiven = 0;

      d.codes.forEach((c: any) => {
        const key = c.code?.toUpperCase();
        if (key && discountPerformance[key]) {
          codePerf[key] = discountPerformance[key];
          totalOrders += discountPerformance[key].orders;
          totalRevenue += discountPerformance[key].revenue;
          totalDiscountGiven += discountPerformance[key].total_discount;
        }
      });

      return {
        ...d,
        performance: {
          total_orders: totalOrders,
          total_revenue: totalRevenue,
          total_discount_given: totalDiscountGiven,
          avg_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          code_performance: codePerf,
        },
      };
    });

    // Summary stats
    const totalActive = enriched.filter((d) => d.status === "active").length;
    const totalExpired = enriched.filter((d) => d.status === "expired").length;
    const totalScheduled = enriched.filter((d) => d.status === "scheduled").length;
    const totalDiscountOrders = enriched.reduce((s, d) => s + d.performance.total_orders, 0);
    const totalDiscountRevenue = enriched.reduce((s, d) => s + d.performance.total_revenue, 0);
    const totalDiscountAmount = enriched.reduce((s, d) => s + d.performance.total_discount_given, 0);

    return NextResponse.json({
      connected: true,
      discounts: enriched,
      summary: {
        total: enriched.length,
        active: totalActive,
        expired: totalExpired,
        scheduled: totalScheduled,
        total_orders_with_discounts: totalDiscountOrders,
        total_revenue_from_discounts: totalDiscountRevenue,
        total_discount_amount: totalDiscountAmount,
      },
    });
  } catch (e) {
    console.error("Shopify discounts error:", e);
    return NextResponse.json({ connected: true, error: String(e) }, { status: 500 });
  }
}
