import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { sitePagePreviewUrl } from "@/lib/site/preview";
import { STORE_ORIGIN } from "@/lib/blogPosts";

export const runtime = "nodejs";

/**
 * GET ?part=… — the signed link to this product's page on its storefront,
 * for the product page's "Site preview" tab.
 *
 * Points at the store's /preview/product~<part> route (the same one the
 * Website editor's "Just one product" mode uses): product data is live,
 * the page layout is the website draft. The store falls back to ANOTHER
 * product when it can't find the part, so a link is only handed out when the
 * part is actually in storefront_products (channel not off) — otherwise
 * `available: false` with a reason the tab shows instead.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const part = new URL(request.url).searchParams.get("part")?.trim();
  if (!part) return NextResponse.json({ error: "part is required" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("storefront_products")
    .select("part, brand, storefront_channel")
    .eq("part", part)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    return NextResponse.json({
      available: false,
      reason: "off",
      message: "This product isn't on a storefront. Turn on D2C in Details to give it a page.",
    });
  }

  const brand: "NI" | "Sassy" | null =
    data.brand === "NI" || data.brand === "Sassy" ? data.brand : null;
  if (!brand) {
    return NextResponse.json({
      available: false,
      reason: "brand",
      message: `${data.brand || "This brand"} doesn't have a storefront, so there's no page to show.`,
    });
  }

  const slug = `product~${part}`;
  const url = sitePagePreviewUrl(brand, slug);
  if (!url) {
    return NextResponse.json({ error: "Preview signing key isn't configured" }, { status: 500 });
  }

  return NextResponse.json({
    available: true,
    brand,
    channel: data.storefront_channel,
    // Shopper-facing D2C page; wholesale-only products have none.
    wholesaleOnly: data.storefront_channel === "wholesale",
    previewUrl: `${url}&bare=1`,
    storeOrigin: STORE_ORIGIN[brand],
    editorHref: `/storefronts/website?brand=${brand}&page=${encodeURIComponent(slug)}`,
  });
}
