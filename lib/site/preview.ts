import { createHmac } from "node:crypto";
import { STORE_ORIGIN, type BlogBrand } from "@/lib/blogPosts";

/**
 * Server-only: the "preview on site" link for a storefront page's DRAFT.
 *
 * Same scheme as blog previews (lib/blogPreview.ts): an HMAC keyed by the
 * shared Supabase service-role key, so nothing new has to be provisioned. The
 * store verifies it in src/lib/site-preview.ts — keep the message string and
 * length in step. BLOG_PREVIEW_ORIGIN_SASSY / _NI point it at a local store.
 */
export function sitePagePreviewUrl(brand: BlogBrand, slug: string): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const token = createHmac("sha256", key)
    .update(`site-page-preview:${brand}:${slug}`)
    .digest("hex")
    .slice(0, 40);
  const origin =
    process.env[`BLOG_PREVIEW_ORIGIN_${brand.toUpperCase()}`]?.replace(/\/$/, "") ||
    STORE_ORIGIN[brand];
  return `${origin}/preview/${slug}?token=${token}`;
}
