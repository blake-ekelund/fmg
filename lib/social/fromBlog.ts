/**
 * Blog post → material for an AI social post. SERVER ONLY.
 *
 * Any status works (draft, scheduled, published) — a social post is often
 * written and scheduled alongside its article. We hand the model the post's
 * title, plain text, its images (hero + in-post) and where/when it goes live.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import { STORE_ORIGIN, type BlogBrand, type BlogStatus } from "@/lib/blogPosts";
import type { ImageCandidate } from "@/lib/generatorImages";

export type BlogForSocial = {
  id: string;
  brand: BlogBrand;
  title: string;
  status: BlogStatus;
  /** When it goes / went live (publish_at, else published_at). */
  liveAt: string | null;
  /** Public article URL (exists once published; the slug is set before that). */
  url: string | null;
  summary: string;
  tags: string[];
  text: string;
  images: ImageCandidate[];
};

/** Blog statuses offered as a starting point (not deleted / archived / mid-generation). */
export const BLOG_SOURCE_STATUSES: BlogStatus[] = ["draft", "human_review", "ready", "ai_draft", "scheduled", "published"];

function absolute(url: string, brand: BlogBrand): string {
  const u = url.trim();
  if (/^https:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${STORE_ORIGIN[brand]}${u}`;
  return "";
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}

/** Article HTML → readable plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|h[1-6]|li|blockquote|div|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Every <img> in the article, with its alt text. */
export function htmlImages(html: string): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    out.push({ src: decode(src), alt: decode(tag.match(/\salt=["']([^"']*)["']/i)?.[1] ?? "") });
  }
  return out;
}

export async function loadBlogForSocial(id: string): Promise<BlogForSocial | null> {
  const { data, error } = await supabaseServer
    .from("blog_posts")
    .select("id, brand, title, slug, body, seo_meta, tags, hero_image_url, status, publish_at, published_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as {
    id: string;
    brand: BlogBrand;
    title: string;
    slug: string | null;
    body: string | null;
    seo_meta: string | null;
    tags: string[] | null;
    hero_image_url: string | null;
    status: BlogStatus;
    publish_at: string | null;
    published_at: string | null;
  };

  const seen = new Set<string>();
  const images: ImageCandidate[] = [];
  const add = (src: string, title: string | null, alt: string | null) => {
    const url = absolute(src, r.brand);
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, title, alt, description: null, source: "library" });
  };
  if (r.hero_image_url) add(r.hero_image_url, "Blog cover photo", r.title);
  for (const im of htmlImages(r.body ?? "")) add(im.src, "Photo from the article", im.alt || null);

  return {
    id: r.id,
    brand: r.brand,
    title: decode(r.title),
    status: r.status,
    liveAt: r.publish_at ?? r.published_at,
    url: r.slug ? `${STORE_ORIGIN[r.brand]}/blog/${r.slug}` : null,
    summary: r.seo_meta ?? "",
    tags: r.tags ?? [],
    text: htmlToText(r.body ?? "").slice(0, 7000),
    images: images.slice(0, 12),
  };
}
