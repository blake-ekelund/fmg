import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_VERSION = "2024-10";

export type ShopifyCredentials = {
  store: string;
  token: string;
} | null;

/**
 * Resolves Shopify credentials from:
 * 1. Environment variables (SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_API_TOKEN)
 * 2. Database (app_settings table — stored via OAuth flow)
 */
export async function getShopifyCredentials(): Promise<ShopifyCredentials> {
  // Check env vars first
  const envStore = process.env.SHOPIFY_STORE_DOMAIN;
  const envToken = process.env.SHOPIFY_ADMIN_API_TOKEN;

  if (envStore && envToken) {
    return { store: envStore, token: envToken };
  }

  // Fall back to database (OAuth token)
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value, metadata")
      .eq("key", "shopify_access_token")
      .single();

    if (!error && data?.value) {
      const shop = data.metadata?.shop || envStore || "";
      return { store: shop, token: data.value };
    }
  } catch {
    // Table might not exist yet
  }

  return null;
}

/**
 * Makes an authenticated request to the Shopify Admin API
 */
export async function shopifyFetch(
  creds: { store: string; token: string },
  endpoint: string,
  params?: Record<string, string>
) {
  // Handle both myshopify.com and custom domains
  let store = creds.store.replace("https://", "").replace("http://", "").replace(/\/$/, "");

  const url = new URL(`https://${store}/admin/api/${API_VERSION}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  return fetch(url.toString(), {
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Gets the Shopify Client ID and Secret for OAuth
 */
export function getShopifyOAuthConfig() {
  return {
    clientId: process.env.SHOPIFY_CLIENT_ID || null,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET || null,
    store: process.env.SHOPIFY_STORE_DOMAIN || "www.naturalinspirations.com",
  };
}
