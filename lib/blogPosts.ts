/**
 * Blog posts — the shared vocabulary between the FMG editor, its API routes,
 * and the storefronts that read the result.
 *
 * A post is written here, given a publish date, and goes live on its brand's
 * storefront by itself when that date passes (see
 * supabase/migrations/20260913000000_blog_scheduling.sql for the mechanism).
 * Nothing in the storefronts knows about drafts: they read a view that only
 * ever contains live rows.
 */

export const BLOG_BRANDS = ["Sassy", "NI"] as const;
export type BlogBrand = (typeof BLOG_BRANDS)[number];

export const BLOG_STATUSES = [
  "generating",
  "ai_draft",
  "human_review",
  "ready",
  "draft",
  "scheduled",
  "published",
  "archived",
  "deleted",
] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

/** Everything the editor treats as "a draft" — the legacy pipeline states
 *  (human_review, ready) fold in here so old rows are still editable. */
export const DRAFT_STATUSES: readonly BlogStatus[] = [
  "draft",
  "human_review",
  "ready",
  "generating",
];

export type BlogPostRow = {
  id: string;
  brand: BlogBrand;
  title: string;
  slug: string | null;
  body: string;
  seo_meta: string | null;
  tags: string[] | null;
  hero_image_url: string | null;
  status: BlogStatus;
  publish_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The list endpoint leaves the body out — it is the heavy column and the
 *  board never shows it. */
export type BlogPostSummary = Omit<BlogPostRow, "body">;

export const BLOG_LIST_COLUMNS =
  "id, brand, title, slug, seo_meta, tags, hero_image_url, status, publish_at, published_at, created_at, updated_at";

/** Where each brand's blog lives. Used to build "view on site" links and to
 *  resolve site-relative hero paths (e.g. /queen/Queen_Header.jpg) in previews. */
export const STORE_ORIGIN: Record<BlogBrand, string> = {
  Sassy: "https://sassyandco.com",
  NI: "https://www.naturalinspirations.com",
};

/** Same rule as public.blog_slugify() in Postgres — keep them identical so a
 *  slug the editor suggests is the one the view would have derived anyway. */
export function slugify(title: string): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isBlogBrand(v: unknown): v is BlogBrand {
  return typeof v === "string" && (BLOG_BRANDS as readonly string[]).includes(v);
}

export function isBlogStatus(v: unknown): v is BlogStatus {
  return typeof v === "string" && (BLOG_STATUSES as readonly string[]).includes(v);
}

/** Tags come in as whatever the chip input produced; store a clean, de-duped
 *  list (or null, which is how the table has always spelled "no tags"). */
export function normalizeTags(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of v) {
    if (typeof t !== "string") continue;
    const clean = t.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.length ? out : null;
}

/** Public URL of a hero image for previews: site-relative paths belong to the
 *  brand's storefront, absolute URLs are used as-is. */
export function resolveHeroUrl(brand: BlogBrand, hero: string | null | undefined): string | null {
  const h = (hero ?? "").trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  return `${STORE_ORIGIN[brand]}${h.startsWith("/") ? h : `/${h}`}`;
}
