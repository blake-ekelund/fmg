import type { LibraryImage } from "@/lib/email/generatePrompt";
import type { BlogBlock, BlogContentBlock } from "./blocks";

/**
 * Images the AI blog generator may place, and the rules that keep it honest.
 *
 * Candidates are our tagged Image Library photos plus the post's brand
 * collection on Unsplash. After generation, every image URL in the post is
 * checked against that list (the model only sees text, so it can misquote or
 * invent a URL), Unsplash photos are kept out of product cards (they aren't
 * our products), and each Unsplash photo used gets its photographer credit.
 */

export type BlogImageCandidate = LibraryImage & {
  source: "library" | "unsplash";
  /** Unsplash only: "Photo by <name> on Unsplash". */
  credit?: string;
  /** Unsplash only: ping when the photo is used (API guideline). */
  downloadLocation?: string;
};

export type ImageCheckResult = {
  blocks: BlogBlock[];
  hero: string;
  /** Unsplash photos the post ended up using (hero included). */
  usedUnsplash: BlogImageCandidate[];
  /** How many model-supplied URLs were blanked for not being on the list. */
  blanked: number;
};

export function checkGeneratedImages(blocks: BlogBlock[], heroUrl: string, candidates: BlogImageCandidate[]): ImageCheckResult {
  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  const used = new Map<string, BlogImageCandidate>();
  let blanked = 0;

  const allow = (url: string, opts: { libraryOnly?: boolean } = {}): BlogImageCandidate | null => {
    const u = url.trim();
    if (!u) return null;
    const c = byUrl.get(u);
    if (!c || (opts.libraryOnly && c.source !== "library")) {
      blanked++;
      return null;
    }
    if (c.source === "unsplash") used.set(c.url, c);
    return c;
  };

  const fix = (b: BlogContentBlock): BlogContentBlock => {
    if (b.type === "image") {
      const c = allow(b.src);
      if (!c) return { ...b, src: "" };
      // Credit the photographer unless the model already wrote one.
      const caption =
        c.source === "unsplash" && c.credit && !/unsplash/i.test(b.caption)
          ? [b.caption.trim(), c.credit].filter(Boolean).join(" · ")
          : b.caption;
      return { ...b, src: c.url, alt: b.alt.trim() || c.alt || "", caption };
    }
    if (b.type === "product") {
      const c = allow(b.imageUrl, { libraryOnly: true });
      return { ...b, imageUrl: c ? c.url : "" };
    }
    return b;
  };

  const out = blocks.map((b): BlogBlock => {
    if (b.type === "section") {
      return { ...b, columns: b.columns.map((col) => ({ ...col, blocks: col.blocks.map(fix) })) };
    }
    if (b.type === "intro" || b.type === "closing") return b;
    return fix(b);
  });

  const heroC = allow(heroUrl);
  return { blocks: out, hero: heroC ? heroC.url : "", usedUnsplash: [...used.values()], blanked };
}
