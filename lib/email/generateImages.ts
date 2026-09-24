import type { ImageCandidate } from "@/lib/generatorImages";
import { createDefaultBlock, type EmailBlock, type TextBlock } from "@/components/templates/types";

/**
 * Post-generation image rules for AI-written emails (the blog's twin is
 * lib/blog/generateImages.ts):
 *   - every image URL must be one we offered, anything else is blanked
 *   - Unsplash photos stay out of product cards, column items and the header logo
 *     (those show our products/brand)
 *   - Unsplash photos used get one credit line, added to the footer's text,
 *     or as a small text block at the end when the email has no footer
 */

export type EmailImageCheck = {
  blocks: EmailBlock[];
  usedUnsplash: ImageCandidate[];
  blanked: number;
};

/** "Photos by A and B on Unsplash." (one line for the whole email). */
export function unsplashCreditLine(used: ImageCandidate[]): string {
  const names = [...new Set(used.map((p) => p.photographer).filter((n): n is string => Boolean(n)))];
  if (!names.length) return "";
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.length === 1 && used.length === 1 ? "Photo" : "Photos"} by ${who} on Unsplash.`;
}

export function checkEmailImages(blocks: EmailBlock[], candidates: ImageCandidate[]): EmailImageCheck {
  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  const used = new Map<string, ImageCandidate>();
  let blanked = 0;

  const allow = (url: string, libraryOnly = false): string => {
    const u = url.trim();
    if (!u) return "";
    const c = byUrl.get(u);
    if (!c || (libraryOnly && c.source !== "library")) {
      blanked++;
      return "";
    }
    if (c.source === "unsplash") used.set(c.url, c);
    return c.url;
  };

  const fix = (b: EmailBlock): EmailBlock => {
    switch (b.type) {
      case "image":
        return { ...b, src: allow(b.src) };
      case "hero":
      case "caption":
        return { ...b, imageUrl: allow(b.imageUrl) };
      case "product":
        return { ...b, imageUrl: allow(b.imageUrl, true) };
      case "columns":
        return { ...b, items: b.items.map((it) => ({ ...it, imageUrl: allow(it.imageUrl, true) })) };
      case "header":
        return { ...b, logoUrl: allow(b.logoUrl, true) };
      case "section":
        return { ...b, bgImage: allow(b.bgImage), columns: b.columns.map((col) => ({ ...col, blocks: col.blocks.map(fix) })) };
      default:
        return b;
    }
  };

  let out = blocks.map(fix);
  const usedUnsplash = [...used.values()];
  const credit = unsplashCreditLine(usedUnsplash);

  if (credit && !JSON.stringify(out).includes("on Unsplash")) {
    const footerAt = out.map((b) => b.type).lastIndexOf("footer");
    if (footerAt >= 0) {
      out = out.map((b, i) => (i === footerAt && b.type === "footer" ? { ...b, text: `${b.text.trim()} ${credit}`.trim() } : b));
    } else {
      const line = createDefaultBlock("text") as TextBlock;
      out = [
        ...out,
        { ...line, html: `<p>${credit}</p>`, fontSize: 11, textAlign: "center", textColor: "#9ca3af", padding: 12 },
      ];
    }
  }

  return { blocks: out, usedUnsplash, blanked };
}
