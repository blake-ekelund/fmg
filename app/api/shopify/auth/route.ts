import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || "www.naturalinspirations.com";
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const SCOPES = [
  "read_orders",
  "read_checkouts",
  "read_customers",
  "read_products",
  "read_product_listings",
  "read_product_feeds",
  "read_price_rules",
  "write_price_rules",
  "read_discounts",
  "write_discounts",
  "read_analytics",
  "read_reports",
].join(",");

/**
 * GET /api/shopify/auth
 * Redirects to Shopify OAuth authorization page
 */
export async function GET(req: NextRequest) {
  if (!SHOPIFY_CLIENT_ID) {
    return NextResponse.json(
      { error: "SHOPIFY_CLIENT_ID not configured in .env.local" },
      { status: 422 }
    );
  }

  // Clean up store domain to just the myshopify domain
  let store = SHOPIFY_STORE.replace("https://", "").replace("http://", "").replace(/\/$/, "");
  // If it's a custom domain, we need the myshopify.com version
  if (!store.includes("myshopify.com")) {
    // Try to use it as-is — Shopify should redirect
    store = store;
  }

  const nonce = Math.random().toString(36).substring(2, 15);
  const redirectUri = `${APP_URL}/api/shopify/callback`;

  const authUrl = `https://${store}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

  return NextResponse.redirect(authUrl);
}
