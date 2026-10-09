/**
 * Keeping AI-made posts varied. SERVER ONLY.
 *
 * Blake's rules: no image used twice within a post or a set, and no repeated
 * ideas. The model is told (recent + upcoming posts go into the prompt), and
 * the images are also enforced after generation: a repeat is swapped for an
 * unused photo of the right kind, and photo posts that came back without a
 * photo get one. Recently used photos are kept out of the pool when there are
 * enough others.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import type { ImageCandidate } from "@/lib/generatorImages";
import { isCanvas, type DesignSlide, type PostDesign, type ProductOption, type SlideLayout } from "./design";
import type { SocialBrand, SocialPost } from "./types";

/** Every image a design uses (layout slides, canvas photos and backgrounds). */
export function designImages(design: PostDesign | null | undefined): string[] {
  if (!design) return [];
  return design.slides.flatMap((s) =>
    isCanvas(s)
      ? [s.bg.image, ...s.layers.flatMap((l) => (l.type === "image" ? [l.src] : []))].filter(Boolean)
      : s.image
        ? [s.image]
        : [],
  );
}

export type RecentContext = {
  /** One line per recent / upcoming post: its title and opening line. */
  ideas: string[];
  /** Images those posts use. */
  images: Set<string>;
};

/** The brand's posts from the last 60 days and everything still to come. */
export async function recentPostContext(brand: SocialBrand): Promise<RecentContext> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data } = await supabaseServer
    .from("social_posts")
    .select("title, caption, design, media, created_at, scheduled_at")
    .eq("brand", brand)
    .or(`created_at.gte.${since},scheduled_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(80);
  const rows = (data ?? []) as Pick<SocialPost, "title" | "caption" | "design" | "media">[];
  const ideas: string[] = [];
  const images = new Set<string>();
  for (const r of rows) {
    const hook = (r.caption ?? "").split("\n").find((l) => l.trim())?.trim() ?? "";
    const line = [r.title?.trim(), hook].filter(Boolean).join(" — ").slice(0, 200);
    if (line) ideas.push(line);
    for (const u of designImages(r.design)) images.add(u);
    for (const m of r.media ?? []) images.add(m.url);
  }
  return { ideas: ideas.slice(0, 50), images };
}

/** Prompt block listing what's been said lately. */
export function recentIdeasBlock(ideas: string[]): string {
  if (!ideas.length) return "";
  return `RECENT AND UPCOMING POSTS for this brand — don't repeat their ideas, angles, headlines or hooks:\n${ideas.map((i) => `- ${i}`).join("\n")}`;
}

/** Drop recently used photos from the pool — unless that would leave too few to choose from. */
export function freshImages<T extends { url: string }>(pool: T[], used: Set<string>, keepAtLeast = 15): T[] {
  const fresh = pool.filter((p) => !used.has(p.url));
  return fresh.length >= keepAtLeast ? fresh : pool;
}

type Pool = { images: ImageCandidate[]; products: ProductOption[] };

/**
 * Make every image appear once across `designs` (in order — the first use
 * keeps it). A repeat on a product slide takes another photo of the same
 * product, else another product photo; anywhere else an unused library or
 * brand photo. Images in `avoid` (recent posts) are only used as a last
 * resort. Optional `needsPhoto[i]` = post i must lead with a photo; if its
 * first slide has none, one is added (photo layout, or cover on a bold tile).
 */
export function enforceImageVariety(
  designs: PostDesign[],
  pool: Pool,
  avoid: Set<string> = new Set(),
  needsPhoto: ({ kind: "product" | "mood"; bold: boolean } | null)[] = [],
): PostDesign[] {
  const used = new Set<string>();
  const productOf = new Map<string, ProductOption>();
  for (const p of pool.products) for (const im of p.images) productOf.set(im.url, p);
  const productUrls = pool.products.flatMap((p) => p.images.map((i) => i.url));
  const library = pool.images.filter((i) => i.source === "library").map((i) => i.url);
  const stock = pool.images.filter((i) => i.source === "unsplash").map((i) => i.url);

  const pick = (choices: string[]) =>
    choices.find((u) => !used.has(u) && !avoid.has(u)) ?? choices.find((u) => !used.has(u)) ?? null;

  const replacementFor = (layout: SlideLayout | "canvas", url: string): string | null => {
    if (layout === "product") {
      const same = productOf.get(url);
      return pick([...(same?.images.map((i) => i.url) ?? []), ...productUrls, ...library]);
    }
    return pick([...library, ...stock, ...productUrls]);
  };

  return designs.map((design, i) => {
    const slides: DesignSlide[] = design.slides.map((s) => {
      if (isCanvas(s)) return s; // the AI writes layout slides; canvas slides are the team's own
      if (!s.image) return s;
      if (!used.has(s.image)) {
        used.add(s.image);
        return s;
      }
      const next = replacementFor(s.layout, s.image);
      if (next) {
        used.add(next);
        return { ...s, image: next };
      }
      // Nothing left: slides that can do without a photo lose it; photo/product slides keep the repeat.
      return s.layout === "photo" || s.layout === "product" ? s : { ...s, image: "" };
    });

    const need = needsPhoto[i];
    const first = slides[0];
    if (need && first && !isCanvas(first) && !first.image) {
      const url = need.kind === "product" ? pick([...productUrls, ...library]) : pick([...library, ...stock, ...productUrls]);
      if (url) {
        used.add(url);
        const layout: SlideLayout = need.kind === "product" && productOf.has(url) ? "product" : need.bold ? "cover" : "photo";
        slides[0] = { ...first, layout, image: url, tone: need.bold ? "dark" : first.tone === "dark" ? "light" : first.tone };
      }
    }
    return { ...design, slides };
  });
}
