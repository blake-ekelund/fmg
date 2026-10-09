/**
 * Storefront page blocks — the content model behind FMG's Website editor
 * (/storefronts/website) and the storefront pages that render it.
 *
 * KEEP IN SYNC: this file and pageDefaults.ts are byte-identical in
 *   fmg          lib/site/
 *   store/sassy  src/lib/fmg/
 * FMG writes `site_pages.draft_blocks` / `published_blocks`; the store reads
 * the published copy through the `storefront_site_pages` view. Both sides
 * normalize (pageDefaults.ts `normalizePage`) so a bad or older row can never
 * break a page, and both fall back to the page's default — the page exactly
 * as it was hand-coded — when nothing is published.
 *
 * Blocks carry content only (words, images, links, product picks). Layout
 * and styling stay in the store's components, so pages always look on-brand.
 * "Locked" blocks stand for parts built by the store's code (the hero quiz,
 * the live product grid, the product details on a product page …): they can't
 * be added or deleted, only edited where they have fields.
 * No imports on purpose: the file must compile unchanged in both repos.
 */

// ── item shapes ────────────────────────────────────────────────────────────

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

export type Stat = { id: string; value: string; label: string };
export type LinkItem = { id: string; label: string; note: string; href: string };
export type InfoCard = {
  id: string;
  tone: "blush" | "ink";
  label: string;
  title: string;
  body: string;
  /** Shown as a mailto link under the body. */
  email: string;
};
export type Benefit = { id: string; lead: string; punch: string };
export type StoryColumn = {
  id: string;
  eyebrow: string;
  heading: string;
  intro: string;
  subheading: string;
  /** Rich text (sanitized HTML). */
  body: string;
  pullQuote: string;
};

export type Tone = "blush" | "pink" | "ink";

// ── blocks ─────────────────────────────────────────────────────────────────

type Base = { id: string; hidden?: boolean };

// Homepage
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
export type NewsletterBlock = Base & {
  type: "newsletter";
  eyebrow: string;
  /** Line breaks are kept. */
  heading: string;
  body: string;
  footnote: string;
};

// Anywhere
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
export type RichTextBlock = Base & {
  type: "rich_text";
  /** Sanitized HTML: h2 h3 p br strong em ul ol li a blockquote. */
  html: string;
};
export type StatsBlock = Base & { type: "stats"; items: Stat[] };
export type QuoteBlock = Base & {
  type: "quote";
  eyebrow: string;
  text: string;
  /** Appended to `text` in the accent color. */
  highlight: string;
  footnote: string;
};
export type LinkListBlock = Base & {
  type: "link_list";
  heading: string;
  subheading: string;
  items: LinkItem[];
};
export type CtaBlock = Base & {
  type: "cta";
  heading: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};
export type CalloutBlock = Base & {
  type: "callout";
  eyebrow: string;
  heading: string;
  html: string;
};

// Page parts (locked)
export type PageHeaderBlock = Base & {
  type: "page_header";
  eyebrow: string;
  title: string;
  lede: string;
  /** Shop page only: what signed-in wholesale buyers see instead. */
  wholesaleEyebrow: string;
  wholesaleTitle: string;
  wholesaleLede: string;
};
export type CatalogBlock = Base & { type: "catalog" };
export type ArticleHeaderBlock = Base & {
  type: "article_header";
  kicker: string;
  title: string;
  /** Second half of the title, in the accent color. */
  titleAccent: string;
  tags: string[];
};
export type StoryCoverBlock = Base & { type: "story_cover" };
export type ContactFormBlock = Base & { type: "contact_form"; heading: string; subheading: string };
export type InfoCardsBlock = Base & { type: "info_cards"; cards: InfoCard[] };
export type PolicyBlock = Base & {
  type: "policy";
  eyebrow: string;
  title: string;
  lede: string;
  highlightLabel: string;
  highlightTitle: string;
  highlightBody: string;
  /** Lead-in line on the dark "get in touch" card. */
  help: string;
  html: string;
};
export type WholesaleIntroBlock = Base & {
  type: "wholesale_intro";
  eyebrow: string;
  title: string;
  lede: string;
  stats: Stat[];
};
export type WholesaleCatalogBlock = Base & {
  type: "wholesale_catalog";
  heading: string;
  linkLabel: string;
  count: number;
};

// Product page template
export type ProductDetailsBlock = Base & {
  type: "product_details";
  /** The one-line brand claims above the detail accordions. */
  trust: string[];
};
export type BenefitsBannerBlock = Base & {
  type: "benefits_banner";
  heading: string;
  items: Benefit[];
  /** Only on products whose form contains one of these comma-separated
   *  words ("hand cr"). Blank = every product. */
  formMatch: string;
};
export type PhilosophyBlock = Base & { type: "philosophy"; columns: StoryColumn[] };
export type RelatedProductsBlock = Base & {
  type: "related_products";
  heading: string;
  wholesaleHeading: string;
};
export type ReviewsNoteBlock = Base & {
  type: "reviews_note";
  eyebrow: string;
  heading: string;
  message: string;
};

export type PageBlock =
  | HeroBlock
  | ValueStripBlock
  | ProductRowBlock
  | ShopByFormBlock
  | NewsletterBlock
  | PromoBannerBlock
  | ImageTextBlock
  | RichTextBlock
  | StatsBlock
  | QuoteBlock
  | LinkListBlock
  | CtaBlock
  | CalloutBlock
  | PageHeaderBlock
  | CatalogBlock
  | ArticleHeaderBlock
  | StoryCoverBlock
  | ContactFormBlock
  | InfoCardsBlock
  | PolicyBlock
  | WholesaleIntroBlock
  | WholesaleCatalogBlock
  | ProductDetailsBlock
  | BenefitsBannerBlock
  | PhilosophyBlock
  | RelatedProductsBlock
  | ReviewsNoteBlock;

export type PageBlockType = PageBlock["type"];

/**
 * Editor metadata. `locked` = built by the store's code: never added or
 * deleted. `pinned` = also always first. `single` = at most one per page.
 */
export const BLOCK_INFO: Record<
  PageBlockType,
  { label: string; description: string; locked?: boolean; pinned?: boolean; single?: boolean }
> = {
  hero: { label: "Hero + quiz", description: "The rotating photo header with the Find your Sassy quiz.", locked: true, pinned: true },
  value_strip: { label: "Value strip", description: "A thin row of short brand promises (desktop only).", single: true },
  product_row: { label: "Product row", description: "Four products — bestsellers, or ones you pick." },
  shop_by_form: { label: "Shop by form", description: "Big photo tiles that link into the filtered shop." },
  newsletter: { label: "Newsletter signup", description: "The 15%-off email signup.", single: true },
  promo_banner: { label: "Promo banner", description: "A bold one-line announcement with a button." },
  image_text: { label: "Image + text", description: "A photo beside a heading, a paragraph and a button." },
  rich_text: { label: "Text", description: "Paragraphs, headings, lists and links." },
  stats: { label: "Stats", description: "Two to four big numbers with a label each." },
  quote: { label: "Pull quote", description: "A big quote with an accent bar." },
  link_list: { label: "Numbered links", description: "A numbered list of links with a note on each." },
  cta: { label: "Closing call to action", description: "A big line with one or two buttons." },
  callout: { label: "Callout card", description: "A soft card with a heading and a paragraph." },
  page_header: { label: "Page header", description: "The small label, big title and intro line.", locked: true, pinned: true },
  catalog: { label: "Live listing", description: "Filled automatically — products or posts.", locked: true },
  article_header: { label: "Article header", description: "Kicker, two-tone headline and tag pills.", locked: true, pinned: true },
  story_cover: { label: "Character photo rotation", description: "The six Everyday shots, each linking to its story.", locked: true },
  contact_form: { label: "Contact form", description: "The message form — its heading and hint are editable.", locked: true },
  info_cards: { label: "Side cards", description: "The cards beside the form.", locked: true },
  policy: { label: "Policy", description: "The policy text and its side cards.", locked: true, pinned: true },
  wholesale_intro: { label: "Wholesale intro", description: "Title, intro and the four stat tiles. Buttons are fixed.", locked: true, pinned: true },
  wholesale_catalog: { label: "Current catalog", description: "Live products by case price.", locked: true },
  product_details: {
    label: "Product details",
    description: "The top of the page, filled from each product.",
    locked: true,
    pinned: true,
  },
  benefits_banner: { label: "Benefits banner", description: "A heading and short punchy benefit lines.", single: true },
  philosophy: { label: "Brand story (two columns)", description: "Two columns of brand copy.", single: true },
  related_products: { label: "Pairs well with", description: "Four related products, picked automatically.", single: true },
  reviews_note: { label: "Reviews", description: "The reviews section (a placeholder until reviews go live).", single: true },
};

export const QUIZ_PERSONAS: { key: string; name: string }[] = [
  { key: "queen", name: "Queen" },
  { key: "bougie", name: "Bougie Babe" },
  { key: "bestie", name: "Bestie" },
  { key: "glowup", name: "Glow Up" },
  { key: "fierce", name: "Fierce Vibes" },
  { key: "hotmess", name: "Hot Mess" },
];

export const LIMITS = {
  slides: 8,
  valueItems: 5,
  tiles: 6,
  rowCount: 8,
  pickParts: 8,
  blocks: 30,
  stats: 4,
  links: 12,
  cards: 3,
  benefits: 8,
  columns: 2,
  tags: 5,
  trust: 4,
};

// ── sanitizing ─────────────────────────────────────────────────────────────

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

/** Links: site paths, #anchors, https URLs and mailto only. Anything else → fallback. */
export function safeHref(v: unknown, fallback = ""): string {
  const s = str(v, 500);
  if (/^\/(?!\/)/.test(s) || /^#[\w-]+$/.test(s) || /^https:\/\//i.test(s) || /^mailto:[^\s"<>]+$/i.test(s)) return s;
  return fallback;
}

/** Images: site paths or https URLs. */
export function safeImage(v: unknown): string {
  const s = str(v, 1000);
  return /^\/(?!\/)/.test(s) || /^https:\/\//i.test(s) ? s : "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", middot: "·",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const RICH_TAGS = ["h2", "h3", "p", "br", "strong", "em", "ul", "ol", "li", "blockquote"];

/**
 * Allowlist HTML sanitizer for rich text blocks: decode entities, escape
 * EVERYTHING, then re-enable bare allowed tags and <a href> with a safe href.
 * Attributes, scripts, styles — anything else — stay escaped text, so the
 * result is safe for dangerouslySetInnerHTML.
 */
export function sanitizeRichHtml(input: unknown, max = 40000): string {
  if (typeof input !== "string") return "";
  const links: string[] = [];
  let s = input
    .slice(0, max)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(\/?)b(\s[^>]*)?>/gi, "<$1strong>")
    .replace(/<(\/?)i(\s[^>]*)?>/gi, "<$1em>")
    .replace(/<(\/?)div(\s[^>]*)?>/gi, "<$1p>")
    .replace(/<(\/?)h[14-6](\s[^>]*)?>/gi, "<$1h3>")
    // Links → placeholders so the escape pass can't touch them.
    .replace(/<a\s[^>]*?href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, (_m, _q, d: string, sq: string) => {
      const href = safeHref(decodeEntities(d ?? sq ?? ""));
      links.push(href);
      return `\u0000A${links.length - 1}\u0000`;
    })
    .replace(/<\/a\s*>/gi, "\u0000/A\u0000")
    .replace(new RegExp(`<(\\/?)(${RICH_TAGS.join("|")})\\s[^>]*>`, "gi"), "<$1$2>");
  s = escapeHtml(decodeEntities(s));
  for (const tag of RICH_TAGS) {
    s = s
      .replace(new RegExp(`&lt;${tag}\\s*/?&gt;`, "gi"), tag === "br" ? "<br>" : `<${tag}>`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, "gi"), tag === "br" ? "" : `</${tag}>`);
  }
  s = s
    .replace(/\u0000A(\d+)\u0000/g, (_m, i: string) => (links[+i] ? `<a href="${escapeHtml(links[+i])}">` : "<a>"))
    .replace(/\u0000\/A\u0000/g, "</a>")
    .replace(/\u0000/g, "");
  return s
    .replace(/<p>\s*(<(ul|ol|h2|h3|blockquote)>)/g, "$1")
    .replace(/(<\/(ul|ol|h2|h3|blockquote)>)\s*<\/p>/g, "$1")
    .replace(/<(p|h2|h3|li)>(\s|<br>)*<\/\1>/g, "")
    .replace(/(<br>\s*)+(<\/(p|li|h2|h3)>)/g, "$2")
    .replace(/<a>([\s\S]*?)<\/a>/g, "$1")
    .trim();
}

function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

function list(v: unknown, max: number): unknown[] {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function itemId(o: Record<string, unknown>, prefix: string, i: number): string {
  return str(o.id, 60) || `${prefix}${i + 1}`;
}

function count(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(LIMITS.rowCount, Math.max(1, n)) : fallback;
}

const TONES = ["blush", "pink", "ink"] as const;

/** Normalize the fields of one block (id/hidden handled by the caller).
 *  Returns null for an unknown type. */
export type BlockFields = PageBlock extends infer B ? (B extends PageBlock ? Omit<B, "id" | "hidden"> : never) : never;

export function normalizeBlockFields(r: Record<string, unknown>): BlockFields | null {
  switch (r.type) {
    case "hero":
      return {
        type: "hero",
        slides: list(r.slides, LIMITS.slides)
          .map((s, i): HeroSlide => {
            const o = obj(s);
            return {
              id: itemId(o, "slide", i),
              name: str(o.name, 60),
              blurb: str(o.blurb, 160),
              part: str(o.part, 40),
              accent: hex(o.accent, "#E8488E"),
              desktopImage: safeImage(o.desktopImage),
              mobileImage: safeImage(o.mobileImage),
              persona: QUIZ_PERSONAS.some((p) => p.key === o.persona) ? (o.persona as string) : "",
            };
          })
          .filter((s) => s.name || s.desktopImage),
      };
    case "value_strip":
      return { type: "value_strip", items: list(r.items, LIMITS.valueItems).map((x) => str(x, 60)).filter(Boolean) };
    case "product_row":
      return {
        type: "product_row",
        heading: str(r.heading, 80),
        linkLabel: str(r.linkLabel, 40),
        linkHref: safeHref(r.linkHref, "/shop"),
        source: pick(r.source, ["bestsellers", "pick"] as const, "bestsellers"),
        parts: [...new Set(list(r.parts, 40).map((x) => str(x, 40)).filter(Boolean))].slice(0, LIMITS.pickParts),
        count: count(r.count, 4),
      };
    case "shop_by_form":
      return {
        type: "shop_by_form",
        heading: str(r.heading, 80),
        linkLabel: str(r.linkLabel, 40),
        linkHref: safeHref(r.linkHref, "/shop"),
        tiles: list(r.tiles, LIMITS.tiles)
          .map((t, i): FormTile => {
            const o = obj(t);
            return {
              id: itemId(o, "tile", i),
              label: str(o.label, 40),
              blurb: str(o.blurb, 120),
              shopType: str(o.shopType, 60),
              match: str(o.match, 120),
              image: safeImage(o.image),
            };
          })
          .filter((t) => t.label),
      };
    case "newsletter":
      return {
        type: "newsletter",
        eyebrow: str(r.eyebrow, 40),
        heading: text(r.heading, 100),
        body: text(r.body, 400),
        footnote: str(r.footnote, 120),
      };
    case "promo_banner":
      return {
        type: "promo_banner",
        eyebrow: str(r.eyebrow, 40),
        text: str(r.text, 160),
        ctaLabel: str(r.ctaLabel, 40),
        ctaHref: safeHref(r.ctaHref),
        tone: pick(r.tone, TONES, "pink"),
      };
    case "image_text":
      return {
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
    case "rich_text":
      return { type: "rich_text", html: sanitizeRichHtml(r.html) };
    case "stats":
      return {
        type: "stats",
        items: list(r.items, LIMITS.stats)
          .map((x, i): Stat => {
            const o = obj(x);
            return { id: itemId(o, "stat", i), value: str(o.value, 20), label: str(o.label, 80) };
          })
          .filter((s) => s.value || s.label),
      };
    case "quote":
      return {
        type: "quote",
        eyebrow: str(r.eyebrow, 40),
        text: text(r.text, 400),
        highlight: str(r.highlight, 200),
        footnote: str(r.footnote, 120),
      };
    case "link_list":
      return {
        type: "link_list",
        heading: str(r.heading, 80),
        subheading: str(r.subheading, 80),
        items: list(r.items, LIMITS.links)
          .map((x, i): LinkItem => {
            const o = obj(x);
            return { id: itemId(o, "link", i), label: str(o.label, 60), note: str(o.note, 80), href: safeHref(o.href) };
          })
          .filter((l) => l.label),
      };
    case "cta":
      return {
        type: "cta",
        heading: str(r.heading, 120),
        primaryLabel: str(r.primaryLabel, 40),
        primaryHref: safeHref(r.primaryHref),
        secondaryLabel: str(r.secondaryLabel, 40),
        secondaryHref: safeHref(r.secondaryHref),
      };
    case "callout":
      return { type: "callout", eyebrow: str(r.eyebrow, 40), heading: str(r.heading, 100), html: sanitizeRichHtml(r.html, 4000) };
    case "page_header":
      return {
        type: "page_header",
        eyebrow: str(r.eyebrow, 60),
        title: str(r.title, 80),
        lede: text(r.lede, 500),
        wholesaleEyebrow: str(r.wholesaleEyebrow, 60),
        wholesaleTitle: str(r.wholesaleTitle, 80),
        wholesaleLede: text(r.wholesaleLede, 500),
      };
    case "catalog":
      return { type: "catalog" };
    case "article_header":
      return {
        type: "article_header",
        kicker: str(r.kicker, 60),
        title: str(r.title, 100),
        titleAccent: str(r.titleAccent, 100),
        tags: list(r.tags, LIMITS.tags).map((x) => str(x, 30)).filter(Boolean),
      };
    case "story_cover":
      return { type: "story_cover" };
    case "contact_form":
      return { type: "contact_form", heading: str(r.heading, 80), subheading: str(r.subheading, 200) };
    case "info_cards":
      return {
        type: "info_cards",
        cards: list(r.cards, LIMITS.cards).map((x, i): InfoCard => {
          const o = obj(x);
          const email = str(o.email, 120);
          return {
            id: itemId(o, "card", i),
            tone: pick(o.tone, ["blush", "ink"] as const, "blush"),
            label: str(o.label, 40),
            title: str(o.title, 80),
            body: text(o.body, 400),
            email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? email : "",
          };
        }),
      };
    case "policy":
      return {
        type: "policy",
        eyebrow: str(r.eyebrow, 60),
        title: str(r.title, 80),
        lede: text(r.lede, 800),
        highlightLabel: str(r.highlightLabel, 40),
        highlightTitle: str(r.highlightTitle, 80),
        highlightBody: text(r.highlightBody, 400),
        help: str(r.help, 160),
        html: sanitizeRichHtml(r.html, 60000),
      };
    case "wholesale_intro":
      return {
        type: "wholesale_intro",
        eyebrow: str(r.eyebrow, 60),
        title: str(r.title, 80),
        lede: text(r.lede, 500),
        stats: list(r.stats, LIMITS.stats).map((x, i): Stat => {
          const o = obj(x);
          return { id: itemId(o, "stat", i), value: str(o.value, 20), label: str(o.label, 40) };
        }),
      };
    case "wholesale_catalog":
      return {
        type: "wholesale_catalog",
        heading: str(r.heading, 80),
        linkLabel: str(r.linkLabel, 40),
        count: count(r.count, 8),
      };
    case "product_details":
      return { type: "product_details", trust: list(r.trust, LIMITS.trust).map((x) => str(x, 40)).filter(Boolean) };
    case "benefits_banner":
      return {
        type: "benefits_banner",
        heading: str(r.heading, 80),
        formMatch: str(r.formMatch, 120),
        items: list(r.items, LIMITS.benefits)
          .map((x, i): Benefit => {
            const o = obj(x);
            return { id: itemId(o, "benefit", i), lead: str(o.lead, 80), punch: str(o.punch, 80) };
          })
          .filter((b) => b.lead || b.punch),
      };
    case "philosophy":
      return {
        type: "philosophy",
        columns: list(r.columns, LIMITS.columns).map((x, i): StoryColumn => {
          const o = obj(x);
          return {
            id: itemId(o, "col", i),
            eyebrow: str(o.eyebrow, 60),
            heading: str(o.heading, 120),
            intro: text(o.intro, 600),
            subheading: str(o.subheading, 100),
            body: sanitizeRichHtml(o.body, 6000),
            pullQuote: str(o.pullQuote, 240),
          };
        }),
      };
    case "related_products":
      return { type: "related_products", heading: str(r.heading, 80), wholesaleHeading: str(r.wholesaleHeading, 80) };
    case "reviews_note":
      return {
        type: "reviews_note",
        eyebrow: str(r.eyebrow, 60),
        heading: str(r.heading, 100),
        message: text(r.message, 400),
      };
  }
  return null;
}

/** One raw block → a valid block (unique id), or null if unknown. */
export function normalizeBlock(raw: unknown, ids: Set<string>): PageBlock | null {
  const r = obj(raw);
  const fields = normalizeBlockFields(r);
  if (!fields) return null;
  let id = str(r.id, 60) || `${fields.type}-${ids.size + 1}`;
  while (ids.has(id)) id = `${id}-x`;
  ids.add(id);
  const hidden = r.hidden === true && !BLOCK_INFO[fields.type].locked ? { hidden: true } : {};
  return { id, ...hidden, ...fields } as PageBlock;
}
