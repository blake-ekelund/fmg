/**
 * Coerce untrusted block JSON (AI output, a PATCH body, an old saved row) into
 * valid BlogBlocks in the brand's format. Unknown types are dropped, missing
 * fields get defaults, ids are filled in and de-duplicated, sections that
 * would be empty are dropped, and enforceFormat() applies the locked
 * intro/closing rules last. Whatever comes in, what comes out opens cleanly
 * in the builder and renders on the store.
 */

import type { BlogBrand } from "@/lib/blogPosts";
import {
  CONTENT_TYPES,
  enforceFormat,
  newBlogId,
  type BlogBlock,
  type BlogContentBlock,
  type SectionColumn,
  type SectionLayout,
} from "./blocks";

const LAYOUTS: SectionLayout[] = ["imageText", "textImage", "twoColumn", "gallery", "callout"];
const MAX_BLOCKS = 200;

type Raw = Record<string, unknown>;

function str(v: unknown, max = 20000): string {
  return typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "";
}

function isObj(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function contentBlock(r: Raw, id: string): BlogContentBlock | null {
  const type = r.type as BlogContentBlock["type"];
  if (!CONTENT_TYPES.includes(type)) return null;
  switch (type) {
    case "heading":
      return { id, type, level: Number(r.level) === 3 ? 3 : 2, text: str(r.text, 300) || "Heading" };
    case "paragraph": {
      const html = str(r.html) || (str(r.text) ? `<p>${str(r.text)}</p>` : "");
      return html ? { id, type, html } : null;
    }
    case "list": {
      const items = Array.isArray(r.items) ? r.items.map((i) => str(i, 2000)).filter((i) => i.trim()) : [];
      return items.length ? { id, type, ordered: r.ordered === true, items } : null;
    }
    case "quote":
      return str(r.text) ? { id, type, text: str(r.text, 1000), cite: str(r.cite, 200) } : null;
    case "image":
      return { id, type, src: str(r.src ?? r.url, 2000), alt: str(r.alt, 300), caption: str(r.caption, 300) };
    case "button":
      return { id, type, text: str(r.text, 80) || "Shop now", url: str(r.url, 2000) || "/shop" };
    case "product":
      return {
        id,
        type,
        imageUrl: str(r.imageUrl, 2000),
        name: str(r.name, 200) || "Product",
        blurb: str(r.blurb ?? r.description, 600),
        price: str(r.price, 40),
        url: str(r.url ?? r.buttonUrl, 2000) || "/shop",
      };
    case "divider":
      return { id, type };
  }
}

export function normalizeBlogBlocks(input: unknown, brand: BlogBrand): BlogBlock[] {
  const seen = new Set<string>();
  const idFor = (raw: unknown): string => {
    // Ids end up in data attributes and CSS selectors in the builder — keep them tame.
    const s = typeof raw === "string" ? raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
    const id = s && !seen.has(s) ? s : newBlogId();
    seen.add(id);
    return id;
  };

  const list = Array.isArray(input) ? input.slice(0, MAX_BLOCKS) : [];
  const out: BlogBlock[] = [];

  for (const r of list) {
    if (!isObj(r)) continue;
    const id = idFor(r.id);
    if (r.type === "intro") {
      const html = str(r.html) || (str(r.text) ? `<p>${str(r.text)}</p>` : "");
      out.push({ id, type: "intro", html: html || "<p></p>" });
      continue;
    }
    if (r.type === "closing") {
      out.push({
        id,
        type: "closing",
        heading: str(r.heading, 200) || "Shop the story",
        text: str(r.text, 600),
        buttonText: str(r.buttonText, 80) || "Shop now",
        url: str(r.url, 2000) || "/shop",
      });
      continue;
    }
    if (r.type === "section") {
      const layout = LAYOUTS.includes(r.layout as SectionLayout) ? (r.layout as SectionLayout) : "twoColumn";
      const rawCols = Array.isArray(r.columns) ? r.columns : [];
      const maxCols = layout === "callout" ? 1 : layout === "gallery" ? 3 : 2;
      const columns: SectionColumn[] = rawCols.slice(0, maxCols).map((c) => {
        const rawBlocks = isObj(c) && Array.isArray(c.blocks) ? c.blocks : Array.isArray(c) ? c : [];
        const blocks = rawBlocks
          .filter(isObj)
          .map((b) => contentBlock(b, idFor(b.id)))
          .filter((b): b is BlogContentBlock => b !== null)
          // A gallery is images only.
          .filter((b) => layout !== "gallery" || b.type === "image");
        return { id: idFor(isObj(c) ? c.id : undefined), blocks };
      });
      if (columns.length === 0 || columns.every((c) => c.blocks.length === 0)) continue;
      out.push({ id, type: "section", layout, columns });
      continue;
    }
    const b = contentBlock(r, id);
    if (b) out.push(b);
  }

  return enforceFormat(brand, out);
}
