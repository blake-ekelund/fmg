/**
 * What the new-post wizard asks: who a post is for and what it's for. Stored
 * on blog_posts (audience, purpose) for the team; the purpose also picks the
 * NI journal category, which the NI store reads from the post's first tag.
 */

import type { BlogBrand } from "@/lib/blogPosts";

export type BlogAudience = "d2c" | "wholesale" | "both";

export const BLOG_AUDIENCES: { value: BlogAudience; label: string; sub: string }[] = [
  { value: "d2c", label: "Shoppers", sub: "People reading the storefront blog" },
  { value: "wholesale", label: "Retail partners", sub: "Stores and buyers who carry the line" },
  { value: "both", label: "Everyone", sub: "Shoppers and retail partners" },
];

export type BlogPurpose =
  | "product_spotlight"
  | "ingredient_story"
  | "ritual_howto"
  | "seasonal_gift"
  | "new_arrival"
  | "brand_story"
  | "news"
  | "other";

/** `niCategory` must match a category in the NI store's journal
 *  (store/ni/src/lib/fmg/blog.ts CATEGORIES). */
export const BLOG_PURPOSES: { value: BlogPurpose; label: string; hint: string; niCategory: string }[] = [
  { value: "product_spotlight", label: "Product spotlight", hint: "One product or collection, up close", niCategory: "New arrivals" },
  { value: "ingredient_story", label: "Ingredient story", hint: "What's in it and why it matters", niCategory: "Ingredient stories" },
  { value: "ritual_howto", label: "Ritual / how-to", hint: "Steps, routines, tips", niCategory: "Rituals" },
  { value: "seasonal_gift", label: "Seasonal / gift guide", hint: "Holidays, occasions, gifting", niCategory: "Rituals" },
  { value: "new_arrival", label: "New arrival / launch", hint: "Announce something new", niCategory: "New arrivals" },
  { value: "brand_story", label: "Brand story", hint: "Who we are and what we believe", niCategory: "The philosophy" },
  { value: "news", label: "News / announcement", hint: "Events, press, updates", niCategory: "The philosophy" },
  { value: "other", label: "Other", hint: "Anything else", niCategory: "Rituals" },
];

export function isBlogAudience(v: unknown): v is BlogAudience {
  return v === "d2c" || v === "wholesale" || v === "both";
}

export function isBlogPurpose(v: unknown): v is BlogPurpose {
  return typeof v === "string" && BLOG_PURPOSES.some((p) => p.value === v);
}

/** Starting tags for a new post: NI's category leads (the store reads the
 *  first matching tag as the category); Sassy starts with the purpose label. */
export function starterTags(brand: BlogBrand, purpose: BlogPurpose): string[] {
  const p = BLOG_PURPOSES.find((x) => x.value === purpose);
  if (!p) return [];
  return brand === "NI" ? [p.niCategory] : [p.label.split(" /")[0]];
}
