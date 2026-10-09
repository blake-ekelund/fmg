/**
 * Storefront page blocks — the content model behind FMG's Website editor
 * (/storefronts/website) and the storefront homepage that renders it.
 *
 * KEEP IN SYNC: this file is byte-identical in
 *   fmg          lib/site/pageBlocks.ts
 *   store/sassy  src/lib/fmg/pageBlocks.ts
 * FMG writes `site_pages.draft_blocks` / `published_blocks`; the store reads
 * the published copy through the `storefront_site_pages` view. Both sides run
 * `normalizePageBlocks` so a bad or older row can never break the page, and
 * both fall back to `DEFAULT_SASSY_HOME` — the homepage exactly as it was
 * hand-coded — when nothing is published.
 *
 * Blocks carry content only (words, images, links, product picks). Layout and
 * styling stay in the store's components, so the page always looks on-brand.
 * No imports on purpose: the file must compile unchanged in both repos.
 */

export type HeroSlide = {
  id: string;
  /** Big headline over the photo. */
  name: string;
  /** One line under the headline. */
  blurb: string;
  /** FMG part the "Shop …" button links to (/products/{part}). */
  part: string;
  /** Accent rule + quiz-card color (#RRGGBB). */
  accent: string;
  /** Landscape photo (desktop). Site-relative ("/queen/…") or https URL. */
  desktopImage: string;
  /** Square photo (mobile). Falls back to the desktop photo when blank. */
  mobileImage: string;
  /** Quiz persona this slide belongs to — the hero locks to it when the
   *  "Find your Sassy" quiz crowns that persona. "" = none. */
  persona: string;
};

export type FormTile = {
  id: string;
  label: string;
  blurb: string;
  /** Shop page filter value (/shop?type=…). */
  shopType: string;
  /** Which products count toward this tile — comma-separated words matched
   *  against the product form ("lip", "gift, set"). */
  match: string;
  /** Cover photo. Blank = first matching product's photo. */
  image: string;
};

export type Tone = "blush" | "pink" | "ink";

type Base = { id: string; hidden?: boolean };

export type HeroBlock = Base & { type: "hero"; slides: HeroSlide[] };
export type ValueStripBlock = Base & { type: "value_strip"; items: string[] };
export type ProductRowBlock = Base & {
  type: "product_row";
  heading: string;
  linkLabel: string;
  linkHref: string;
  /** bestsellers = real $-sold leaders (topped up automatically);
   *  pick = exactly the parts listed, in order. */
  source: "bestsellers" | "pick";
  parts: string[];
  count: number;
};
export type ShopByFormBlock = Base & {
  type: "shop_by_form";
  heading: string;
  linkLabel: string;
  linkHref: string;
  tiles: FormTile[];
};
export type PromoBannerBlock = Base & {
  type: "promo_banner";
  eyebrow: string;
  text: string;
  ctaLabel: string;
  ctaHref: string;
  tone: Tone;
};
export type ImageTextBlock = Base & {
  type: "image_text";
  image: string;
  imageAlt: string;
  imageSide: "left" | "right";
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  tone: Tone;
};
export type NewsletterBlock = Base & {
  type: "newsletter";
  eyebrow: string;
  /** Line breaks are kept. */
  heading: string;
  body: string;
  footnote: string;
};

export type PageBlock =
  | HeroBlock
  | ValueStripBlock
  | ProductRowBlock
  | ShopByFormBlock
  | PromoBannerBlock
  | ImageTextBlock
  | NewsletterBlock;

export type PageBlockType = PageBlock["type"];

/** Editor palette metadata. `locked` blocks can't be added, moved or deleted. */
export const BLOCK_INFO: Record<
  PageBlockType,
  { label: string; description: string; locked?: boolean; single?: boolean }
> = {
  hero: {
    label: "Hero + quiz",
    description: "The rotating photo header with the Find your Sassy quiz.",
    locked: true,
  },
  value_strip: {
    label: "Value strip",
    description: "A thin row of short brand promises (desktop only).",
    single: true,
  },
  product_row: {
    label: "Product row",
    description: "Four products — bestsellers, or ones you pick.",
  },
  shop_by_form: {
    label: "Shop by form",
    description: "Big photo tiles that link into the filtered shop.",
  },
  promo_banner: {
    label: "Promo banner",
    description: "A bold one-line announcement with a button.",
  },
  image_text: {
    label: "Image + text",
    description: "A photo beside a heading, a paragraph and a button.",
  },
  newsletter: {
    label: "Newsletter signup",
    description: "The 15%-off email signup.",
    single: true,
  },
};

export const QUIZ_PERSONAS: { key: string; name: string }[] = [
  { key: "queen", name: "Queen" },
  { key: "bougie", name: "Bougie Babe" },
  { key: "bestie", name: "Bestie" },
  { key: "glowup", name: "Glow Up" },
  { key: "fierce", name: "Fierce Vibes" },
  { key: "hotmess", name: "Hot Mess" },
];

export const LIMITS = { slides: 8, valueItems: 5, tiles: 6, rowCount: 8, pickParts: 8, blocks: 24 };

// ── Defaults: the homepage as it was hand-coded (Oct 2026) ─────────────────

export const DEFAULT_SASSY_HOME: PageBlock[] = [
  {
    id: "hero",
    type: "hero",
    slides: [
      {
        id: "queen",
        name: "Queen",
        blurb: "Power moves + no apologies.",
        part: "123-00-02",
        accent: "#8B4FC7",
        desktopImage: "/queen/Queen_Header_1920x1067_01.jpg",
        mobileImage: "/queen/Queen_Image_1080x1080_01.jpg",
        persona: "queen",
      },
      {
        id: "bougie",
        name: "Bougie Babe",
        blurb: "Glam + luxe elegance.",
        part: "123-00-01",
        accent: "#E8488E",
        desktopImage: "/bougiebabe/Bougie-Babe_Header_1920x1067_01.jpg",
        mobileImage: "/bougiebabe/Bougie-Babe_Image_1080x1080_01.jpg",
        persona: "bougie",
      },
      {
        id: "bestie",
        name: "Bestie",
        blurb: "Love + all the tea.",
        part: "123-00-04",
        accent: "#E83A7A",
        desktopImage: "/bestie/Bestie_Header_1920x1067_01.jpg",
        mobileImage: "/bestie/Bestie_Image_1080x1080_01.jpg",
        persona: "bestie",
      },
      {
        id: "glowup",
        name: "Glow Up",
        blurb: "Sea salt citrus, infused with style.",
        part: "123-00-05",
        accent: "#E7488F",
        desktopImage: "/glowup/Glow-Up_Header_1920x1067_01.jpg",
        mobileImage: "/glowup/Glow-Up_Image_1080x1080_01.jpg",
        persona: "glowup",
      },
      {
        id: "fierce",
        name: "Fierce Vibes",
        blurb: "Hustle + unstoppable energy.",
        part: "123-00-07",
        accent: "#D44120",
        desktopImage: "/firecevibes/Fierce_Header_1920x1067_01.jpg",
        mobileImage: "/firecevibes/Fierce_Image_1080x1080_01.jpg",
        persona: "fierce",
      },
      {
        id: "hotmess",
        name: "Hot Mess",
        blurb: "Chaos + effortless charm.",
        part: "123-00-06",
        accent: "#E84A2C",
        desktopImage: "/hotmess/Hot-Mess_Header_1920x577_03.jpg",
        mobileImage: "/hotmess/Hot-Mess_Image_1080x1080_01.jpg",
        persona: "hotmess",
      },
    ],
  },
  {
    id: "values",
    type: "value_strip",
    items: ["Vegan & cruelty-free", "Made in small batches", "Scents that move on their own"],
  },
  {
    id: "bestsellers",
    type: "product_row",
    heading: "Bestsellers",
    linkLabel: "Shop all →",
    linkHref: "/shop",
    source: "bestsellers",
    parts: [],
    count: 4,
  },
  {
    id: "forms",
    type: "shop_by_form",
    heading: "Shop by form",
    linkLabel: "Shop all →",
    linkHref: "/shop",
    tiles: [
      {
        id: "hand",
        label: "Hand Crèmes",
        blurb: "The daily hydrator — six personalities deep.",
        shopType: "mini hand crème",
        match: "hand cr",
        image: "",
      },
      {
        id: "lip",
        label: "Lip Butters",
        blurb: "Same attitude, softer pout.",
        shopType: "lip butter",
        match: "lip",
        image: "",
      },
      {
        id: "gift",
        label: "Gift Sets",
        blurb: "Wrapped, ribboned, ready to hand over.",
        shopType: "gift set",
        match: "gift, set",
        image: "",
      },
    ],
  },
  {
    id: "newsletter",
    type: "newsletter",
    eyebrow: "join the group chat",
    heading: "get 15% off\nyour first order",
    body: "New drops, restocks, the occasional life update. Unsubscribing is allowed but emotionally devastating.",
    footnote: "retail orders only · wholesale has its own pricing",
  },
];

/** A fresh block of `type` for the editor's "Add block" menu. */
export function newPageBlock(type: PageBlockType, id: string): PageBlock {
  switch (type) {
    case "hero":
      return { ...(DEFAULT_SASSY_HOME[0] as HeroBlock), id };
    case "value_strip":
      return { id, type, items: ["Vegan & cruelty-free"] };
    case "product_row":
      return { id, type, heading: "New arrivals", linkLabel: "Shop all →", linkHref: "/shop", source: "pick", parts: [], count: 4 };
    case "shop_by_form":
      return { ...(DEFAULT_SASSY_HOME[3] as ShopByFormBlock), id };
    case "promo_banner":
      return { id, type, eyebrow: "limited time", text: "Free shipping on orders over $50", ctaLabel: "Shop now", ctaHref: "/shop", tone: "pink" };
    case "image_text":
      return {
        id,
        type,
        image: "",
        imageAlt: "",
        imageSide: "left",
        eyebrow: "our story",
        heading: "Made in small batches",
        body: "Tell the story here.",
        ctaLabel: "Read more",
        ctaHref: "/story",
        tone: "blush",
      };
    case "newsletter":
      return { ...(DEFAULT_SASSY_HOME[4] as NewsletterBlock), id };
  }
}

// ── Normalizing (runs on every save in FMG and every read in the store) ────

function str(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Multi-line text: trims each end, keeps inner line breaks. */
function text(v: unknown, max = 1000): string {
  return typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}

function hex(v: unknown, fallback: string): string {
  const s = str(v, 7);
  return /^#[0-9a-f]{6}$/i.test(s) ? s : fallback;
}

/** Links: site paths, https URLs and mailto only. Anything else → fallback. */
export function safeHref(v: unknown, fallback = ""): string {
  const s = str(v, 500);
  if (/^\/(?!\/)/.test(s) || /^https:\/\//i.test(s) || /^mailto:[^\s]+$/i.test(s)) return s;
  return fallback;
}

/** Images: site paths or https URLs. */
export function safeImage(v: unknown): string {
  const s = str(v, 1000);
  return /^\/(?!\/)/.test(s) || /^https:\/\//i.test(s) ? s : "";
}

function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const TONES = ["blush", "pink", "ink"] as const;

function normalizeOne(raw: unknown, ids: Set<string>): PageBlock | null {
  const r = obj(raw);
  let id = str(r.id, 60) || `b${ids.size + 1}`;
  while (ids.has(id)) id = `${id}-x`;
  const hidden = r.hidden === true ? true : undefined;
  const base = { id, ...(hidden ? { hidden } : {}) };
  let block: PageBlock | null = null;

  switch (r.type) {
    case "hero": {
      const slides = list(r.slides)
        .slice(0, LIMITS.slides)
        .map((s, i): HeroSlide => {
          const o = obj(s);
          return {
            id: str(o.id, 60) || `slide${i + 1}`,
            name: str(o.name, 60),
            blurb: str(o.blurb, 160),
            part: str(o.part, 40),
            accent: hex(o.accent, "#E8488E"),
            desktopImage: safeImage(o.desktopImage),
            mobileImage: safeImage(o.mobileImage),
            persona: QUIZ_PERSONAS.some((p) => p.key === o.persona) ? (o.persona as string) : "",
          };
        })
        .filter((s) => s.name || s.desktopImage);
      block = {
        ...base,
        hidden: undefined,
        type: "hero",
        slides: slides.length ? slides : (DEFAULT_SASSY_HOME[0] as HeroBlock).slides,
      };
      break;
    }
    case "value_strip":
      block = {
        ...base,
        type: "value_strip",
        items: list(r.items).map((x) => str(x, 60)).filter(Boolean).slice(0, LIMITS.valueItems),
      };
      break;
    case "product_row": {
      const count = Math.round(Number(r.count));
      block = {
        ...base,
        type: "product_row",
        heading: str(r.heading, 80),
        linkLabel: str(r.linkLabel, 40),
        linkHref: safeHref(r.linkHref, "/shop"),
        source: pick(r.source, ["bestsellers", "pick"] as const, "bestsellers"),
        parts: [...new Set(list(r.parts).map((x) => str(x, 40)).filter(Boolean))].slice(0, LIMITS.pickParts),
        count: Number.isFinite(count) ? Math.min(LIMITS.rowCount, Math.max(1, count)) : 4,
      };
      break;
    }
    case "shop_by_form":
      block = {
        ...base,
        type: "shop_by_form",
        heading: str(r.heading, 80),
        linkLabel: str(r.linkLabel, 40),
        linkHref: safeHref(r.linkHref, "/shop"),
        tiles: list(r.tiles)
          .slice(0, LIMITS.tiles)
          .map((t, i): FormTile => {
            const o = obj(t);
            return {
              id: str(o.id, 60) || `tile${i + 1}`,
              label: str(o.label, 40),
              blurb: str(o.blurb, 120),
              shopType: str(o.shopType, 60),
              match: str(o.match, 120),
              image: safeImage(o.image),
            };
          })
          .filter((t) => t.label),
      };
      break;
    case "promo_banner":
      block = {
        ...base,
        type: "promo_banner",
        eyebrow: str(r.eyebrow, 40),
        text: str(r.text, 160),
        ctaLabel: str(r.ctaLabel, 40),
        ctaHref: safeHref(r.ctaHref),
        tone: pick(r.tone, TONES, "pink"),
      };
      break;
    case "image_text":
      block = {
        ...base,
        type: "image_text",
        image: safeImage(r.image),
        imageAlt: str(r.imageAlt, 200),
        imageSide: pick(r.imageSide, ["left", "right"] as const, "left"),
        eyebrow: str(r.eyebrow, 40),
        heading: str(r.heading, 100),
        body: text(r.body, 1200),
        ctaLabel: str(r.ctaLabel, 40),
        ctaHref: safeHref(r.ctaHref),
        tone: pick(r.tone, TONES, "blush"),
      };
      break;
    case "newsletter":
      block = {
        ...base,
        type: "newsletter",
        eyebrow: str(r.eyebrow, 40),
        heading: text(r.heading, 100),
        body: text(r.body, 400),
        footnote: str(r.footnote, 120),
      };
      break;
  }
  if (block) ids.add(id);
  return block;
}

/**
 * Coerce anything into a valid block list: unknown types dropped, strings
 * trimmed and capped, links/images allow-listed, exactly one hero and it is
 * first (the quiz drives the page below it), single-use blocks deduped.
 * Returns null for input that isn't an array at all, so callers can fall
 * back to the defaults.
 */
export function normalizePageBlocks(input: unknown): PageBlock[] | null {
  if (!Array.isArray(input)) return null;
  const ids = new Set<string>();
  const seen = new Set<PageBlockType>();
  let hero: PageBlock | null = null;
  const rest: PageBlock[] = [];
  for (const raw of input.slice(0, LIMITS.blocks)) {
    const b = normalizeOne(raw, ids);
    if (!b) continue;
    if (b.type === "hero") {
      hero ??= b;
      continue;
    }
    if (BLOCK_INFO[b.type].single && seen.has(b.type)) continue;
    seen.add(b.type);
    rest.push(b);
  }
  return [hero ?? DEFAULT_SASSY_HOME[0], ...rest];
}
