/**
 * Blog blocks — the builder's document model.
 *
 * A post built in FMG is an ordered list of these blocks. The storefronts never
 * see them: on every save the server compiles them to plain semantic HTML
 * (lib/blog/render.ts) and writes that to blog_posts.body, which is the only
 * thing sassyandco.com / naturalinspirations.com read. So the storefront
 * contract is unchanged — `blocks` is FMG's editable source, `body` is output.
 *
 * Unlike email blocks there are NO style knobs here: no colours, fonts, sizes,
 * or padding. Every post on a brand reads the same because the brand owns the
 * look (the storefront's article typography + the BLOG_THEMES accents the
 * renderer inlines for buttons, cards, and callouts). The editor can arrange
 * content; it can't restyle it. That is the "same format per brand" rule.
 *
 * The format also fixes the shape of a post (see BLOG_FORMATS): every post
 * opens with a locked Intro, and a Sassy post always closes with a locked
 * "Shop the story" block (NI's journal page appends its own collection CTA,
 * so an NI post has none).
 */

import type { BlogBrand } from "@/lib/blogPosts";

export type BlogBlockType =
  | "intro"
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "image"
  | "button"
  | "product"
  | "divider"
  | "closing"
  | "section";

type Base = { id: string };

/** The post's opening paragraph. Locked first; NI renders it as the lead. */
export type IntroBlock = Base & { type: "intro"; html: string };
export type HeadingBlock = Base & { type: "heading"; level: 2 | 3; text: string };
/** Inline markup only: bold, italic, links, line breaks. */
export type ParagraphBlock = Base & { type: "paragraph"; html: string };
export type ListBlock = Base & { type: "list"; ordered: boolean; items: string[] };
export type QuoteBlock = Base & { type: "quote"; text: string; cite: string };
export type ImageBlock = Base & { type: "image"; src: string; alt: string; caption: string };
export type ButtonBlock = Base & { type: "button"; text: string; url: string };
export type ProductBlock = Base & {
  type: "product";
  imageUrl: string;
  name: string;
  blurb: string;
  price: string;
  url: string;
};
export type DividerBlock = Base & { type: "divider" };
/** Sassy's locked sign-off: a heading, a line, and a shop button. */
export type ClosingBlock = Base & {
  type: "closing";
  heading: string;
  text: string;
  buttonText: string;
  url: string;
};

/**
 * Sections are the only layouts, and each is a fixed shape — no free column
 * weights or backgrounds:
 *   imageText / textImage — an image beside a stack of content
 *   twoColumn             — two content stacks side by side
 *   gallery               — 2–3 images in a row
 *   callout               — one tinted box in the brand's accent
 * Side-by-side layouts wrap to a single column on phones (flex-wrap with a
 * min basis — the storefront strips nothing inline, but can't take media
 * queries from post HTML).
 */
export type SectionLayout = "imageText" | "textImage" | "twoColumn" | "gallery" | "callout";
export type SectionColumn = { id: string; blocks: BlogContentBlock[] };
export type SectionBlock = Base & { type: "section"; layout: SectionLayout; columns: SectionColumn[] };

/** What may live inside a section column. */
export type BlogContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | ImageBlock
  | ButtonBlock
  | ProductBlock
  | DividerBlock;

export type BlogBlock = BlogContentBlock | IntroBlock | ClosingBlock | SectionBlock;

export const CONTENT_TYPES: BlogContentBlock["type"][] = [
  "heading",
  "paragraph",
  "list",
  "quote",
  "image",
  "button",
  "product",
  "divider",
];

export const LOCKED_TYPES: BlogBlockType[] = ["intro", "closing"];

export function isLocked(b: BlogBlock): boolean {
  return b.type === "intro" || b.type === "closing";
}

/* ─── Brand formats ─── */

export type BlogFormat = {
  label: string;
  /** Locked closing block at the end of every post. */
  closing: boolean;
  /** Headline shown in the palette so the team knows the rules. */
  rules: string;
};

export const BLOG_FORMATS: Record<BlogBrand, BlogFormat> = {
  Sassy: {
    label: "Sassy blog",
    closing: true,
    rules:
      "Every Sassy post opens with an intro and ends with a Shop the story block. Type, colour, and spacing come from the Sassy site.",
  },
  NI: {
    label: "NI Journal",
    closing: false,
    rules:
      "Every journal post opens with an intro (set as the lead). The site adds its own collection link at the end. Type, colour, and spacing come from the NI site.",
  },
};

/** Accents the renderer inlines for the few elements the storefront's article
 *  typography doesn't style (buttons, cards, callouts, captions, rules).
 *  Taken from each store's theme tokens. */
export const BLOG_THEMES: Record<
  BlogBrand,
  { accent: string; ink: string; muted: string; tint: string; line: string; buttonRadius: string; serif: boolean }
> = {
  Sassy: {
    accent: "#B3295C",
    ink: "#1a1a1a",
    muted: "#6b7280",
    tint: "#F1E6E4",
    line: "#ead9d6",
    buttonRadius: "999px",
    serif: false,
  },
  NI: {
    accent: "#1F3D35",
    ink: "#1F3D35",
    muted: "#6b6b6b",
    tint: "#EEF2EE",
    line: "#d9cfbf",
    buttonRadius: "999px",
    serif: true,
  },
};

/* ─── Constructors ─── */

export function newBlogId(): string {
  return `bb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultClosing(brand: BlogBrand): ClosingBlock {
  return {
    id: newBlogId(),
    type: "closing",
    heading: brand === "Sassy" ? "Shop the story" : "Explore the collection",
    text: "Everything in this post is on the shelf now.",
    buttonText: "Shop now",
    url: "/shop",
  };
}

export function createBlock(type: BlogContentBlock["type"]): BlogContentBlock {
  const id = newBlogId();
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "Section heading" };
    case "paragraph":
      return { id, type, html: "<p>Write something worth reading.</p>" };
    case "list":
      return { id, type, ordered: false, items: ["First point", "Second point", "Third point"] };
    case "quote":
      return { id, type, text: "A line worth pulling out.", cite: "" };
    case "image":
      return { id, type, src: "", alt: "", caption: "" };
    case "button":
      return { id, type, text: "Shop now", url: "/shop" };
    case "product":
      return { id, type, imageUrl: "", name: "Product name", blurb: "One line on why it belongs in this story.", price: "", url: "/shop" };
    case "divider":
      return { id, type };
  }
}

function col(blocks: BlogContentBlock[]): SectionColumn {
  return { id: newBlogId(), blocks };
}

function contentStack(): BlogContentBlock[] {
  return [
    { ...(createBlock("heading") as HeadingBlock), level: 3, text: "A smaller heading" },
    createBlock("paragraph"),
  ];
}

export const SECTION_LAYOUTS: { layout: SectionLayout; label: string; hint: string }[] = [
  { layout: "imageText", label: "Image + Text", hint: "Photo on the left, words on the right" },
  { layout: "textImage", label: "Text + Image", hint: "Words on the left, photo on the right" },
  { layout: "twoColumn", label: "Two columns", hint: "Two stacks side by side" },
  { layout: "gallery", label: "Gallery", hint: "Two or three photos in a row" },
  { layout: "callout", label: "Callout", hint: "A tinted box for a tip or offer" },
];

export function createSection(layout: SectionLayout): SectionBlock {
  const id = newBlogId();
  const image = () => [createBlock("image")];
  switch (layout) {
    case "imageText":
      return { id, type: "section", layout, columns: [col(image()), col(contentStack())] };
    case "textImage":
      return { id, type: "section", layout, columns: [col(contentStack()), col(image())] };
    case "twoColumn":
      return { id, type: "section", layout, columns: [col(contentStack()), col(contentStack())] };
    case "gallery":
      return { id, type: "section", layout, columns: [col(image()), col(image())] };
    case "callout":
      return {
        id,
        type: "section",
        layout,
        columns: [
          col([
            { ...(createBlock("heading") as HeadingBlock), level: 3, text: "Good to know" },
            { ...(createBlock("paragraph") as ParagraphBlock), html: "<p>A tip, a ritual, or an offer.</p>" },
          ]),
        ],
      };
  }
}

/** The "Brand template" start: the format's skeleton with guidance copy. */
export function brandTemplate(brand: BlogBrand): BlogBlock[] {
  const intro: IntroBlock = {
    id: newBlogId(),
    type: "intro",
    html: "<p>Open with the hook — one or two sentences on why this matters to the reader right now.</p>",
  };
  const body: BlogBlock[] = [
    { id: newBlogId(), type: "heading", level: 2, text: "The first big idea" },
    { id: newBlogId(), type: "paragraph", html: "<p>Explain it plainly. Keep paragraphs short — three or four sentences.</p>" },
    createSection("imageText"),
    { id: newBlogId(), type: "heading", level: 2, text: "How to make it part of your routine" },
    { id: newBlogId(), type: "list", ordered: true, items: ["Step one", "Step two", "Step three"] },
    { id: newBlogId(), type: "quote", text: "A line worth pulling out.", cite: "" },
  ];
  return enforceFormat(brand, [intro, ...body]);
}

/* ─── Format enforcement ─── */

/**
 * Put a block list into the brand's format: exactly one intro, first; exactly
 * one closing, last, on brands that have one (none on brands that don't);
 * sections only at the top level and never empty. Idempotent — run it after
 * every edit, on load, and on the server before rendering.
 */
export function enforceFormat(brand: BlogBrand, blocks: BlogBlock[]): BlogBlock[] {
  let intro = blocks.find((b): b is IntroBlock => b.type === "intro");
  const closing = blocks.find((b): b is ClosingBlock => b.type === "closing");
  const middle = blocks.filter((b) => b.type !== "intro" && b.type !== "closing");

  if (!intro) {
    // Promote a leading paragraph to the intro rather than inventing copy.
    const first = middle[0];
    if (first && first.type === "paragraph") {
      middle.shift();
      intro = { id: first.id, type: "intro", html: first.html };
    } else {
      intro = { id: newBlogId(), type: "intro", html: "<p></p>" };
    }
  }

  const out: BlogBlock[] = [intro, ...middle];
  if (BLOG_FORMATS[brand].closing) out.push(closing ?? defaultClosing(brand));
  return out;
}

/* ─── Tree helpers (top level + one level of section columns) ─── */

export function findBlogBlock(blocks: BlogBlock[], id: string): BlogBlock | undefined {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === "section") {
      for (const c of b.columns) {
        const hit = c.blocks.find((x) => x.id === id);
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

/** The section a nested block lives in, if any. */
export function parentSection(blocks: BlogBlock[], id: string): SectionBlock | undefined {
  for (const b of blocks) {
    if (b.type === "section" && b.columns.some((c) => c.blocks.some((x) => x.id === id))) return b;
  }
  return undefined;
}

export function updateBlogBlock(blocks: BlogBlock[], updated: BlogBlock): BlogBlock[] {
  return blocks.map((b) => {
    if (b.id === updated.id) return updated;
    if (b.type === "section") {
      return {
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          blocks: c.blocks.map((x) => (x.id === updated.id ? (updated as BlogContentBlock) : x)),
        })),
      };
    }
    return b;
  });
}

export function removeBlogBlock(blocks: BlogBlock[], id: string): BlogBlock[] {
  const target = findBlogBlock(blocks, id);
  if (!target || isLocked(target)) return blocks;
  return blocks
    .filter((b) => b.id !== id)
    .map((b) =>
      b.type === "section"
        ? { ...b, columns: b.columns.map((c) => ({ ...c, blocks: c.blocks.filter((x) => x.id !== id) })) }
        : b,
    );
}

/** Fresh ids all the way down — for duplicating. */
function reId<T extends BlogBlock>(b: T): T {
  if (b.type === "section") {
    return {
      ...b,
      id: newBlogId(),
      columns: b.columns.map((c) => ({ id: newBlogId(), blocks: c.blocks.map((x) => reId(x)) })),
    } as T;
  }
  return { ...b, id: newBlogId() };
}

export function duplicateBlogBlock(blocks: BlogBlock[], id: string): BlogBlock[] {
  const target = findBlogBlock(blocks, id);
  if (!target || isLocked(target)) return blocks;
  return insertBlogBlock(blocks, reId(target), id, "after");
}

/**
 * Insert a block before/after `targetId`, wherever the target lives. Rules the
 * format imposes: nothing goes before the intro or after the closing, and a
 * section only goes at the top level.
 */
export function insertBlogBlock(
  blocks: BlogBlock[],
  block: BlogBlock,
  targetId: string,
  pos: "before" | "after",
): BlogBlock[] {
  const topIdx = blocks.findIndex((b) => b.id === targetId);
  if (topIdx >= 0) {
    const target = blocks[topIdx];
    let at = pos === "after" ? topIdx + 1 : topIdx;
    if (target.type === "intro") at = topIdx + 1;
    if (target.type === "closing") at = topIdx;
    return [...blocks.slice(0, at), block, ...blocks.slice(at)];
  }
  if (block.type === "section" || block.type === "intro" || block.type === "closing") return blocks;
  return blocks.map((b) => {
    if (b.type !== "section") return b;
    return {
      ...b,
      columns: b.columns.map((c) => {
        const idx = c.blocks.findIndex((x) => x.id === targetId);
        if (idx < 0) return c;
        const at = pos === "after" ? idx + 1 : idx;
        return { ...c, blocks: [...c.blocks.slice(0, at), block, ...c.blocks.slice(at)] };
      }),
    };
  });
}

/** Append to the end of the body (before a closing block, if there is one). */
export function appendBlogBlock(blocks: BlogBlock[], block: BlogBlock): BlogBlock[] {
  const closingIdx = blocks.findIndex((b) => b.type === "closing");
  if (closingIdx < 0) return [...blocks, block];
  return [...blocks.slice(0, closingIdx), block, ...blocks.slice(closingIdx)];
}

/** Append a content block to a section column (used for empty-column drops). */
export function appendToColumn(blocks: BlogBlock[], columnId: string, block: BlogContentBlock): BlogBlock[] {
  return blocks.map((b) =>
    b.type === "section"
      ? { ...b, columns: b.columns.map((c) => (c.id === columnId ? { ...c, blocks: [...c.blocks, block] } : c)) }
      : b,
  );
}

/** Move an existing block to before/after a target (drag to reorder). */
export function moveBlogBlock(
  blocks: BlogBlock[],
  draggedId: string,
  targetId: string,
  pos: "before" | "after",
): BlogBlock[] {
  if (draggedId === targetId) return blocks;
  const dragged = findBlogBlock(blocks, draggedId);
  if (!dragged || isLocked(dragged)) return blocks;
  if (dragged.type === "section" && dragged.columns.some((c) => c.blocks.some((x) => x.id === targetId))) {
    return blocks;
  }
  const targetTop = blocks.some((b) => b.id === targetId);
  if (dragged.type === "section" && !targetTop) return blocks;
  const without = removeBlogBlock(blocks, draggedId);
  const next = insertBlogBlock(without, dragged, targetId, pos);
  return next === without ? blocks : next;
}

export function moveBlogBlockToColumn(blocks: BlogBlock[], draggedId: string, columnId: string): BlogBlock[] {
  const dragged = findBlogBlock(blocks, draggedId);
  if (!dragged || isLocked(dragged) || dragged.type === "section") return blocks;
  return appendToColumn(removeBlogBlock(blocks, draggedId), columnId, dragged as BlogContentBlock);
}

/** Nudge up/down among siblings; locked blocks never move and nothing passes them. */
export function nudgeBlogBlock(blocks: BlogBlock[], id: string, dir: -1 | 1): BlogBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length || isLocked(blocks[i]) || isLocked(blocks[j])) return blocks;
    const arr = [...blocks];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return arr;
  }
  return blocks.map((b) => {
    if (b.type !== "section") return b;
    return {
      ...b,
      columns: b.columns.map((c) => {
        const k = c.blocks.findIndex((x) => x.id === id);
        const m = k + dir;
        if (k < 0 || m < 0 || m >= c.blocks.length) return c;
        const arr = [...c.blocks];
        [arr[k], arr[m]] = [arr[m], arr[k]];
        return { ...c, blocks: arr };
      }),
    };
  });
}

/** Every image URL in the post, for "is anything missing a picture" checks. */
export function countEmptyImages(blocks: BlogBlock[]): number {
  let n = 0;
  const visit = (b: BlogBlock) => {
    if (b.type === "image" && !b.src.trim()) n++;
    if (b.type === "section") b.columns.forEach((c) => c.blocks.forEach(visit));
  };
  blocks.forEach(visit);
  return n;
}
