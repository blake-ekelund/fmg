import { createHmac } from "node:crypto";
import { STORE_ORIGIN, type BlogBrand } from "@/lib/blogPosts";

/**
 * Server-only: the "Preview on site" link for a post.
 *
 * Each storefront serves /blog/preview/<id>?token=<t>, rendering the post in
 * any status through its real article page. The token is an HMAC of the post
 * id keyed by the Supabase service-role key — the one secret FMG and both
 * stores already share for this project — so nothing new needs provisioning.
 * The stores implement the same digest in src/lib/blog-preview.ts; keep the
 * message string and length in step.
 *
 * BLOG_PREVIEW_ORIGIN_SASSY / _NI override the store origin (e.g. a local
 * dev server); production defaults to the live sites.
 */
export function blogPreviewUrl(brand: BlogBrand, id: string): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const token = createHmac("sha256", key).update(`blog-preview:${id}`).digest("hex").slice(0, 40);
  const origin =
    process.env[`BLOG_PREVIEW_ORIGIN_${brand.toUpperCase()}`]?.replace(/\/$/, "") ||
    STORE_ORIGIN[brand];
  return `${origin}/blog/preview/${id}?token=${token}`;
}
