import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getShopifyCredentials } from "@/lib/shopify";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SHOPIFY_API_VERSION = "2024-10";

type ShopifyPriceRuleResponse = {
  price_rule: {
    id: number;
    title: string;
  };
};

type ShopifyDiscountCodeResponse = {
  discount_code: {
    id: number;
    code: string;
    price_rule_id: number;
  };
};

/**
 * POST /api/promotions/sync-shopify
 * Syncs a promotion to Shopify as a Price Rule + Discount Code
 *
 * Body: { promotion_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    // Check Shopify credentials
    const creds = await getShopifyCredentials();
    if (!creds) {
      return NextResponse.json(
        {
          error: "Shopify not configured",
          message: "Connect your Shopify store via the Shopify Analytics page to enable promotion syncing.",
        },
        { status: 422 }
      );
    }

    const SHOPIFY_STORE = creds.store;
    const SHOPIFY_TOKEN = creds.token;

    const { promotion_id } = await req.json();
    if (!promotion_id) {
      return NextResponse.json({ error: "promotion_id required" }, { status: 400 });
    }

    // Fetch the promotion
    const { data: promo, error: fetchErr } = await supabase
      .from("promotions")
      .select("*")
      .eq("id", promotion_id)
      .single();

    if (fetchErr || !promo) {
      return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
    }

    // Only sync D2C or both-channel promotions
    if (promo.channel === "wholesale") {
      return NextResponse.json(
        { error: "Wholesale-only promotions cannot be synced to Shopify" },
        { status: 400 }
      );
    }

    const shopifyBase = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}`;
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
    };

    // Build the price rule payload
    const priceRule: Record<string, unknown> = {
      title: promo.name,
      target_type: "line_item",
      target_selection: promo.applies_to === "all" ? "all" : "entitled",
      allocation_method: promo.allocation_method || "across",
      customer_selection: "all",
      starts_at: promo.starts_at,
      ends_at: promo.ends_at || undefined,
      usage_limit: promo.max_uses || undefined,
      once_per_customer: promo.one_per_customer,
    };

    // Set value type based on discount type
    switch (promo.discount_type) {
      case "percentage":
        priceRule.value_type = "percentage";
        priceRule.value = `-${promo.discount_value}`;
        break;
      case "fixed_amount":
        priceRule.value_type = "fixed_amount";
        priceRule.value = `-${promo.discount_value}`;
        // For fixed_amount, use the chosen allocation method
        priceRule.allocation_method = promo.allocation_method || "across";
        break;
      case "free_shipping":
        priceRule.target_type = "shipping_line";
        priceRule.target_selection = "all";
        priceRule.allocation_method = "across";
        priceRule.value_type = "percentage";
        priceRule.value = "-100.0";
        break;
      case "buy_x_get_y":
        // BXGY uses percentage for the "get" portion
        priceRule.value_type = "percentage";
        priceRule.value = `-${promo.get_discount_percent || 100}.0`;
        priceRule.allocation_method = "across";
        priceRule.prerequisite_quantity_range = {
          greater_than_or_equal_to: promo.buy_quantity || 2,
        };
        priceRule.entitled_quantity = promo.get_quantity || 1;
        break;
    }

    // Minimum purchase subtotal (works for all types including free_shipping)
    if (promo.minimum_purchase) {
      priceRule.prerequisite_subtotal_range = {
        greater_than_or_equal_to: `${promo.minimum_purchase}`,
      };
    }

    // Collection targeting — use numeric Shopify collection IDs
    if (promo.applies_to === "specific_collections" && promo.collection_ids?.length) {
      priceRule.entitled_collection_ids = promo.collection_ids.map((id: string) => parseInt(id));
    }

    let priceRuleId = promo.shopify_discount_id;

    if (priceRuleId) {
      // Update existing price rule
      const updateRes = await fetch(`${shopifyBase}/price_rules/${priceRuleId}.json`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ price_rule: priceRule }),
      });
      if (!updateRes.ok) {
        const err = await updateRes.text();
        console.error("Shopify update error:", err);
        return NextResponse.json(
          { error: "Shopify update failed", details: err },
          { status: 502 }
        );
      }
    } else {
      // Create new price rule
      const createRes = await fetch(`${shopifyBase}/price_rules.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({ price_rule: priceRule }),
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("Shopify create error:", err);
        return NextResponse.json(
          { error: "Shopify create failed", details: err },
          { status: 502 }
        );
      }
      const created: ShopifyPriceRuleResponse = await createRes.json();
      priceRuleId = String(created.price_rule.id);

      // Create the discount code if we have a code
      if (promo.code) {
        const codeRes = await fetch(
          `${shopifyBase}/price_rules/${priceRuleId}/discount_codes.json`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              discount_code: { code: promo.code },
            }),
          }
        );
        if (!codeRes.ok) {
          console.error("Shopify discount code error:", await codeRes.text());
        }
      }
    }

    // Update our database with sync status
    await supabase
      .from("promotions")
      .update({
        shopify_discount_id: priceRuleId,
        shopify_synced: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", promotion_id);

    return NextResponse.json({
      success: true,
      shopify_price_rule_id: priceRuleId,
      message: `Promotion "${promo.name}" synced to Shopify`,
    });
  } catch (e) {
    console.error("Sync error:", e);
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/promotions/sync-shopify
 * Check Shopify connection status
 */
export async function GET() {
  const creds = await getShopifyCredentials();
  if (!creds) {
    return NextResponse.json({
      connected: false,
      message: "Shopify not connected. Go to Shopify Analytics to connect your store.",
    });
  }

  // Test the connection
  try {
    const res = await fetch(
      `https://${creds.store}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
      {
        headers: {
          "X-Shopify-Access-Token": creds.token,
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        connected: true,
        store: data.shop?.name || creds.store,
        domain: data.shop?.domain || creds.store,
      });
    }
    return NextResponse.json({ connected: false, message: "Invalid credentials" });
  } catch {
    return NextResponse.json({ connected: false, message: "Connection failed" });
  }
}
