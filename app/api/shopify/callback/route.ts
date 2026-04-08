import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/shopify/callback
 * Handles the OAuth callback from Shopify, exchanges code for access token,
 * and stores it in Supabase for future API calls.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");

  if (!code || !shop) {
    return NextResponse.json({ error: "Missing code or shop parameter" }, { status: 400 });
  }

  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    return NextResponse.json({ error: "Shopify credentials not configured" }, { status: 422 });
  }

  try {
    // Exchange the authorization code for a permanent access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Shopify token exchange failed:", errText);
      return NextResponse.redirect(
        `${APP_URL}/shopify-analytics?error=token_exchange_failed`
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;

    if (!accessToken) {
      return NextResponse.redirect(
        `${APP_URL}/shopify-analytics?error=no_token`
      );
    }

    // Store the token in Supabase (in a settings/config table)
    // First, check if we have a shopify_settings table, if not use a simple approach
    const { error: upsertErr } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: "shopify_access_token",
          value: accessToken,
          metadata: { shop, scope, connected_at: new Date().toISOString() },
        },
        { onConflict: "key" }
      );

    if (upsertErr) {
      console.error("Failed to store token:", upsertErr);
      // Even if storage fails, we can log it for manual setup
      console.log("=== SHOPIFY ACCESS TOKEN ===");
      console.log(`Token: ${accessToken}`);
      console.log(`Shop: ${shop}`);
      console.log(`Scope: ${scope}`);
      console.log("Add this to .env.local as SHOPIFY_ADMIN_API_TOKEN");
      console.log("============================");
    }

    // Redirect back to analytics page with success
    return NextResponse.redirect(
      `${APP_URL}/shopify-analytics?connected=true&shop=${shop}`
    );
  } catch (e) {
    console.error("OAuth callback error:", e);
    return NextResponse.redirect(
      `${APP_URL}/shopify-analytics?error=callback_failed`
    );
  }
}
