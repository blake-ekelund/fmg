import { NextResponse } from "next/server";
import { getShopifyCredentials, shopifyFetch } from "@/lib/shopify";

/**
 * GET /api/shopify/collections
 * Fetches all custom collections + smart collections from Shopify
 * Returns a unified list of { id, title, handle, products_count }
 */
export async function GET() {
  const creds = await getShopifyCredentials();
  if (!creds) {
    return NextResponse.json({ connected: false, error: "Shopify not configured" }, { status: 422 });
  }

  try {
    // Fetch both custom and smart collections in parallel
    const [customRes, smartRes] = await Promise.all([
      shopifyFetch(creds, "/custom_collections.json", { limit: "250", fields: "id,title,handle,body_html,updated_at" }),
      shopifyFetch(creds, "/smart_collections.json", { limit: "250", fields: "id,title,handle,body_html,updated_at" }),
    ]);

    let collections: Array<{
      id: string;
      title: string;
      handle: string;
      type: "custom" | "smart";
    }> = [];

    if (customRes.ok) {
      const { custom_collections } = await customRes.json();
      (custom_collections || []).forEach((c: any) => {
        collections.push({
          id: String(c.id),
          title: c.title,
          handle: c.handle,
          type: "custom",
        });
      });
    }

    if (smartRes.ok) {
      const { smart_collections } = await smartRes.json();
      (smart_collections || []).forEach((c: any) => {
        collections.push({
          id: String(c.id),
          title: c.title,
          handle: c.handle,
          type: "smart",
        });
      });
    }

    // Sort alphabetically
    collections.sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({ connected: true, collections });
  } catch (e) {
    console.error("Shopify collections error:", e);
    return NextResponse.json({ connected: true, error: String(e) }, { status: 500 });
  }
}
