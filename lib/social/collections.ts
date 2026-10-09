/**
 * The storefront collections, for "make the grid about a collection".
 * SERVER ONLY.
 *
 * The collection LIST lives in each store's code (Sassy: src/lib/products.ts,
 * NI: src/lib/collections.ts) — mirrored here: slug, name and how products
 * belong. Sassy products carry a `collection` column; NI products belong by
 * their `fragrance` value. NI's words (tagline, story, notes) come from the
 * Website editor's "Fragrance collections (words)" page when it's been
 * published, else its defaults. Keep the lists in step with the stores.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import { STORE_ORIGIN } from "@/lib/blogPosts";
import { niDefaultBlocks } from "@/lib/site/pageDefaultsNi";
import type { CollectionsCopyBlock } from "@/lib/site/pageBlocks";
import type { ProductOption } from "./design";
import type { SocialBrand } from "./types";

export type SiteCollection = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  notes: string[];
  url: string;
};

const SASSY: Omit<SiteCollection, "url">[] = [
  {
    slug: "everyday",
    name: "Everyday",
    tagline: "Daily Rotation",
    description: "Your unbothered, glowing, well-moisturized routine. The ones you reach for before you've even had coffee.",
    notes: [],
  },
  {
    slug: "love",
    name: "Love",
    tagline: "Gift-Ready & Extra",
    description: "For the people you actually like. Wrapped, ribboned, and ready to make you the favorite.",
    notes: [],
  },
  {
    slug: "holiday",
    name: "Holiday",
    tagline: "Limited Drops",
    description: "Seasonal flings. Here for a good time, not a long time. Once they're gone, they're gone.",
    notes: [],
  },
];

/** NI fragrance lines and the FMG `fragrance` values that belong to each. */
const NI_KEYS: { slug: string; name: string; keys: string[] }[] = [
  { slug: "sea-salt-citrus", name: "Sea Salt Citrus", keys: ["Sea Salt", "Sea Salt Citrus"] },
  { slug: "lavender-ylang", name: "Lavender Ylang", keys: ["Lavender", "Lavender Ylang"] },
  { slug: "eucalyptus-rosemary-mint", name: "Eucalyptus Rosemary Mint", keys: ["Eucalyptus", "Eucalyptus Rosemary Mint"] },
  { slug: "coconut-ambre-vanille", name: "Coconut Ambre Vanille", keys: ["Coconut", "Coconut Ambre Vanille"] },
  { slug: "grapefruit-bergamot", name: "Grapefruit Bergamot", keys: ["Grapefruit", "Grapefruit Bergamot"] },
  { slug: "agave-pear", name: "Agave Pear", keys: ["Agave Pear"] },
  { slug: "orange-ginger", name: "Orange Ginger", keys: ["Orange Ginger"] },
  { slug: "cypres", name: "Cyprès", keys: ["Cypres", "Cyprès"] },
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function copyItems(blocks: unknown): CollectionsCopyBlock["items"] {
  if (!Array.isArray(blocks)) return [];
  const b = blocks.find((x) => (x as { type?: string })?.type === "collections_copy") as CollectionsCopyBlock | undefined;
  return b?.items ?? [];
}

export async function listSiteCollections(brand: SocialBrand): Promise<SiteCollection[]> {
  const origin = STORE_ORIGIN[brand];
  if (brand === "Sassy") return SASSY.map((c) => ({ ...c, url: `${origin}/collections/${c.slug}` }));

  const { data } = await supabaseServer
    .from("site_pages")
    .select("published_blocks")
    .eq("brand", "NI")
    .eq("slug", "collection-copy")
    .maybeSingle();
  const published = copyItems(data?.published_blocks);
  const defaults = copyItems(niDefaultBlocks("collection-copy"));
  return NI_KEYS.map((c) => {
    const words = published.find((i) => i.slug === c.slug) ?? defaults.find((i) => i.slug === c.slug);
    return {
      slug: c.slug,
      name: c.name,
      tagline: words?.tagline ?? "",
      description: words?.description ?? "",
      notes: (words?.notes ?? []).filter(Boolean),
      url: `${origin}/collections/${c.slug}`,
    };
  });
}

export function productsInCollection(brand: SocialBrand, slug: string, products: ProductOption[]): ProductOption[] {
  if (brand === "Sassy") return products.filter((p) => p.collection === slug);
  const keys = new Set((NI_KEYS.find((c) => c.slug === slug)?.keys ?? []).map(norm));
  return products.filter((p) => p.fragrance && keys.has(norm(p.fragrance)));
}

export function collectionBlock(c: SiteCollection, products: ProductOption[]): string {
  return [
    `SOURCE COLLECTION — the whole set is about this collection from our site. Every post features it; products from it are the stars. Send people to ${c.url} (say "link in bio" on Instagram).`,
    `Name: ${c.name}`,
    c.tagline ? `Tagline: ${c.tagline}` : "",
    c.description ? `Story: ${c.description}` : "",
    c.notes.length ? `Scent notes: ${c.notes.join(" · ")}` : "",
    `Products in it: ${products.map((p) => p.name + (p.size ? ` (${p.size})` : "")).join("; ") || "(none listed)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}
