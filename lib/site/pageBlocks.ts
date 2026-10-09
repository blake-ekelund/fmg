/**
 * Storefront page blocks — the content model behind FMG's Website editor
 * (/storefronts/website) and the storefront pages that render it.
 *
 * KEEP IN SYNC: this file is byte-identical in
 *   fmg          lib/site/
 *   store/sassy  src/lib/fmg/   (with pageDefaults.ts — the Sassy pages)
 *   store/ni     src/lib/fmg/   (with pageDefaultsNi.ts — the NI pages)
 * FMG writes `site_pages.draft_blocks` / `published_blocks`; the store reads
 * the published copy through the `storefront_site_pages` view. Both sides
 * normalize (pageDefaults.ts `normalizePage`) so a bad or older row can never
 * break a page, and both fall back to the page's default — the page exactly
 * as it was hand-coded — when nothing is published.
 *
 * Blocks carry content (words, images, links, product picks). Layout and
 * type stay in the store's components, so pages always look on-brand; color
 * is the one style editors control — the site theme (Colors page) and an
 * optional per-block override, both as the store's own color tokens.
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
  /** blush = soft tint, ink = dark, plain = white with a border. */
  tone: "blush" | "ink" | "plain";
  label: string;
  title: string;
  body: string;
  /** Shown as a mailto link under the body. */
  email: string;
  /** Shown as a tel: link. */
  phone: string;
  /** Small two-column rows, one per line: "Consumer (CST) | Mon–Fri, 8–4:30". */
  details: string;
  linkLabel: string;
  linkHref: string;
};
export type FaqItem = { id: string; q: string; a: string };
export type SeedItem = { id: string; name: string; note: string };
export type SeedCard = { id: string; name: string; origin: string; body: string };
export type Pillar = { id: string; title: string; body: string };
export type LinkCard = { id: string; eyebrow: string; title: string; body: string; href: string };
export type StoryFrame = { id: string; name: string; image: string; href: string };
export type QuizPersonaCopy = {
  /** Fixed persona key (queen, bougie …) — the scoring and hero slides use it. */
  key: string;
  name: string;
  tag: string;
  scent: string;
  crown: string;
  /** FMG part of her hero product. */
  part: string;
  /** Her story: /blog/{slug}. */
  slug: string;
  image: string;
  surface: string;
  ink: string;
  accent: string;
  accentInk: string;
};
export type QuizOption = {
  id: string;
  label: string;
  /** Points toward each persona key (0–5). */
  weights: Record<string, number>;
};
export type QuizQuestion = { id: string; prompt: string; options: QuizOption[] };
export type QuizScentOption = { id: string; label: string; persona: string };
export type FooterLink = { id: string; label: string; href: string };
export type FooterColumn = { id: string; heading: string; links: FooterLink[] };
export type CollectionCopy = {
  /** Fixed collection slug (the store's collection list decides which exist). */
  slug: string;
  /** Shown for reference only — names stay in the store's code. */
  name: string;
  tagline: string;
  description: string;
  notes: string[];
  heroLabel: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  heroCta: string;
  heroInvitation: string;
  heroKicker: string;
  heroLine: string;
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

type Base = {
  id: string;
  hidden?: boolean;
  /** This block's own colors (theme-token key → #hex) over the site theme. */
  colors?: BlockColors;
};

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
export type StoryCoverBlock = Base & { type: "story_cover"; frames: StoryFrame[] };
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

// Natural Inspirations sections
export type LivingHeroBlock = Base & { type: "living_hero" };
export type CollectionShowcaseBlock = Base & {
  type: "collection_showcase";
  eyebrow: string;
  heading: string;
  lede: string;
  linkLabel: string;
  /** Reassurance line under the panels. [text](/path) makes a link. */
  comfort: string[];
};
export type SeedBandBlock = Base & {
  type: "seed_band";
  eyebrow: string;
  heading: string;
  html: string;
  items: SeedItem[];
  ctaLabel: string;
  ctaHref: string;
};
export type SeedCardsBlock = Base & {
  type: "seed_cards";
  eyebrow: string;
  heading: string;
  items: SeedCard[];
  closingHeading: string;
  closingBody: string;
  ctaLabel: string;
  ctaHref: string;
};
export type StatementBlock = Base & { type: "statement"; eyebrow: string; heading: string; body: string };
export type ChecklistBlock = Base & {
  type: "checklist";
  eyebrow: string;
  heading: string;
  intro: string;
  items: string[];
  marker: "check" | "leaf";
};
export type TwoListsBlock = Base & {
  type: "two_lists";
  eyebrow: string;
  heading: string;
  leftTitle: string;
  leftItems: string[];
  rightTitle: string;
  rightItems: string[];
};
export type PillarsBlock = Base & { type: "pillars"; items: Pillar[] };
export type LinkGridBlock = Base & {
  type: "link_grid";
  eyebrow: string;
  heading: string;
  items: { id: string; label: string; href: string }[];
};
export type LinkCardsBlock = Base & { type: "link_cards"; cards: LinkCard[] };
export type FaqBlock = Base & { type: "faq"; heading: string; items: FaqItem[] };

// Site-wide content (fixed "pages" in the editor)
export type QuizBlock = Base & {
  type: "quiz";
  /** Small label on the homepage quiz card. */
  cardLabel: string;
  personas: QuizPersonaCopy[];
  /** The personality questions, in order. The LAST option of the LAST one is
   *  the scent-first branch into the scent question. */
  questions: QuizQuestion[];
  scentPrompt: string;
  scentOptions: QuizScentOption[];
};
export type AnnouncementBlock = Base & {
  type: "announcement";
  /** Rotating top-bar messages. [text](/path) makes a link. */
  retail: string[];
  /** What signed-in wholesale buyers see instead. */
  wholesale: string[];
};
export type FooterBlock = Base & {
  type: "footer";
  tagline: string;
  subscribeEyebrow: string;
  subscribeText: string;
  columns: FooterColumn[];
  sisterEyebrow: string;
  sisterName: string;
  sisterHref: string;
  sisterBlurb: string;
  /** {year} becomes the current year. */
  copyright: string;
};
export type CollectionsCopyBlock = Base & { type: "collections_copy"; items: CollectionCopy[] };

// Widgets + embeds
/** A link to a saved widget (site_widgets): the page shows the widget's
 *  current content, so editing the widget updates every page using it. */
export type WidgetBlock = Base & { type: "widget"; widgetId: string };
/** The site theme (Colors page): theme-token key → #hex. Missing keys keep
 *  the store's built-in color. */
export type ThemeBlock = Base & { type: "theme"; palette: BlockColors };
export type EmbedKind = "video" | "instagram" | "map" | "form" | "countdown";
/** A trusted embed — never raw code. Only the id / query is kept from what
 *  the editor pastes; the store builds the frame URL itself (embedSrc). */
export type EmbedBlock = Base & {
  type: "embed";
  kind: EmbedKind;
  /** video/instagram/form: the share link; map: an address or place. */
  source: string;
  heading: string;
  caption: string;
  /** Countdown: when it ends (ISO). */
  endsAt: string;
  /** Countdown: shown once it has ended. */
  endedText: string;
  ctaLabel: string;
  ctaHref: string;
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
  | ReviewsNoteBlock
  | LivingHeroBlock
  | CollectionShowcaseBlock
  | SeedBandBlock
  | SeedCardsBlock
  | StatementBlock
  | ChecklistBlock
  | TwoListsBlock
  | PillarsBlock
  | LinkGridBlock
  | LinkCardsBlock
  | FaqBlock
  | QuizBlock
  | AnnouncementBlock
  | FooterBlock
  | CollectionsCopyBlock
  | WidgetBlock
  | ThemeBlock
  | EmbedBlock;

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
  living_hero: {
    label: "Collection hero",
    description: "The living photo hero — one slide per fragrance collection, from the collection pages.",
    locked: true,
    pinned: true,
  },
  collection_showcase: {
    label: "Fragrance collections",
    description: "A panel per collection with its two bestsellers — filled automatically.",
    locked: true,
  },
  seed_band: { label: "ExSeed band", description: "The dark seed-oil band: heading, text and the seeds with a note each." },
  seed_cards: { label: "Seed cards", description: "A card per seed oil, plus a closing card with a button." },
  statement: { label: "Statement band", description: "A dark band with one big line." },
  checklist: { label: "Checklist", description: "A heading and intro beside a list of short commitments." },
  two_lists: { label: "Always in / never in", description: "Two lists side by side." },
  pillars: { label: "Numbered cards", description: "Three numbered cards with a title and text." },
  link_grid: { label: "Link grid", description: "A tinted box of linked tiles." },
  link_cards: { label: "Link cards", description: "Two big linked cards." },
  faq: { label: "Questions", description: "A heading and question / answer cards." },
  quiz: {
    label: "Find your Sassy quiz",
    description: "The questions, answers, scoring and results — used by the homepage quiz card, /quiz and the chat.",
    locked: true,
  },
  announcement: { label: "Announcement bar", description: "The rotating messages above the header, on every page.", locked: true },
  footer: { label: "Footer", description: "The footer on every page: tagline, link columns and the sister brand.", locked: true },
  widget: { label: "Widget", description: "A saved block shared across pages — edit it once, every page updates." },
  embed: { label: "Embed", description: "A video, Instagram post, map, Google Form or countdown." },
  theme: { label: "Site colors", description: "The colors every page is built from.", locked: true },
  collections_copy: {
    label: "Fragrance collections",
    description: "Each collection's words — on the homepage hero and panels, the collections page and its own page.",
    locked: true,
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
  seeds: 8,
  checklist: 12,
  listItems: 16,
  pillars: 4,
  linkGrid: 12,
  linkCards: 3,
  faqs: 12,
  frames: 8,
  footerColumns: 4,
  footerLinks: 10,
  announcements: 6,
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

function strings(v: unknown, max: number, len: number): string[] {
  return list(v, max).map((x) => str(x, len)).filter(Boolean);
}

function itemId(o: Record<string, unknown>, prefix: string, i: number): string {
  return str(o.id, 60) || `${prefix}${i + 1}`;
}

function count(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(LIMITS.rowCount, Math.max(1, n)) : fallback;
}

const TONES = ["blush", "pink", "ink"] as const;
export const EMBED_KINDS = ["video", "instagram", "map", "form", "countdown"] as const;

/**
 * The frame URL for an embed, built from a parsed id — never from the
 * pasted string itself. Null when the source isn't a recognized link (or for
 * a countdown, which the store draws itself).
 */
export function embedSrc(b: Pick<EmbedBlock, "kind" | "source">): string | null {
  const src = b.source.trim();
  switch (b.kind) {
    case "video": {
      const yt =
        src.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
      if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
      const vm = src.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/i);
      if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
      return null;
    }
    case "instagram": {
      const ig = src.match(/instagram\.com\/(p|reel)\/([\w-]{5,40})/i);
      return ig ? `https://www.instagram.com/${ig[1].toLowerCase()}/${ig[2]}/embed` : null;
    }
    case "map":
      return src ? `https://www.google.com/maps?q=${encodeURIComponent(src.slice(0, 200))}&output=embed` : null;
    case "form": {
      const gf = src.match(/docs\.google\.com\/forms\/d\/e\/([\w-]{20,120})/i);
      return gf ? `https://docs.google.com/forms/d/e/${gf[1]}/viewform?embedded=true` : null;
    }
    case "countdown":
      return null;
  }
}

/** Block types that can be saved as a widget (not page parts, not site-wide,
 *  not single-per-page sections). */
// ── colors ─────────────────────────────────────────────────────────────────

/** Theme-token key → #rrggbb (see THEME_TOKENS). */
export type BlockColors = Record<string, string>;

/** One editable theme color: the store CSS variables it sets and their
 *  built-in value (globals.css). */
export type ThemeToken = { key: string; label: string; hint: string; value: string; vars: string[] };

/** A block's full-width background band — not a theme token. */
export const SECTION_BG = "section";

/**
 * Each store's editable colors. The values are the stores' globals.css
 * defaults — KEEP IN SYNC with them. Every block renderer colors itself with
 * these variables, so overriding them (site-wide on :root, or on one block's
 * wrapper) recolors without touching the components. A token's FIRST variable
 * must be one no section remaps (Sassy's .readable-ink remaps --ink) — the
 * Colors preview's swatches read it.
 */
export const THEME_TOKENS: Record<"Sassy" | "NI", ThemeToken[]> = {
  Sassy: [
    { key: "pink", label: "Hot pink", hint: "The brand pink — big type, accents, badges.", value: "#FF3E86", vars: ["--pink-pop", "--ink", "--foreground"] },
    { key: "roseDeep", label: "Deep rose", hint: "Links, highlighted words, button hovers.", value: "#B3295C", vars: ["--rose-deep"] },
    { key: "heading", label: "Headings", hint: "Section headings.", value: "#1A1A1A", vars: ["--heading"] },
    { key: "text", label: "Text", hint: "Body text and dark buttons.", value: "#2E2428", vars: ["--charcoal"] },
    { key: "textSoft", label: "Soft text", hint: "Notes, captions, secondary lines.", value: "#6E5F66", vars: ["--charcoal-soft"] },
    { key: "blush", label: "Blush", hint: "Soft card and band backgrounds.", value: "#F1E6E4", vars: ["--blush"] },
    { key: "rose", label: "Rose", hint: "Soft accents and backdrops.", value: "#E7B5A4", vars: ["--rose"] },
    { key: "burgundy", label: "Burgundy", hint: "Borders and deep accents.", value: "#761E0B", vars: ["--burgundy", "--ink-soft"] },
    { key: "burnt", label: "Burnt orange", hint: "Selected options.", value: "#EE542F", vars: ["--burnt"] },
    { key: "surface", label: "Cards & light text", hint: "Card backgrounds, and text on dark bands.", value: "#FFFFFF", vars: ["--cream"] },
    { key: "background", label: "Page background", hint: "Behind everything.", value: "#FFFFFF", vars: ["--background"] },
  ],
  NI: [
    { key: "spruce", label: "Spruce", hint: "Headings and dark bands (header bar, footer).", value: "#1F3D35", vars: ["--spruce"] },
    { key: "text", label: "Text", hint: "Body text.", value: "#2A3B35", vars: ["--ink", "--foreground"] },
    { key: "textSoft", label: "Soft text", hint: "Notes, captions, secondary lines.", value: "#5E7068", vars: ["--ink-soft"] },
    { key: "eucalyptus", label: "Eucalyptus", hint: "Buttons and links.", value: "#44705F", vars: ["--eucalyptus"] },
    { key: "eucalyptusDeep", label: "Deep eucalyptus", hint: "Button hovers and accents.", value: "#2F5446", vars: ["--eucalyptus-deep"] },
    { key: "gold", label: "Gold", hint: "Small labels above headings, fine details.", value: "#A8895A", vars: ["--gold"] },
    { key: "mist", label: "Mist", hint: "Soft sage bands and cards.", value: "#E9EEE7", vars: ["--mist"] },
    { key: "linen", label: "Linen", hint: "Warm cards.", value: "#F2EDE2", vars: ["--linen"] },
    { key: "paper", label: "Ivory", hint: "Page background, and text on dark bands.", value: "#FBF9F4", vars: ["--paper", "--background"] },
  ],
};

function themeTokens(brand: string): ThemeToken[] {
  return THEME_TOKENS[brand as "Sassy" | "NI"] ?? [];
}

/** Valid colors only, known-looking keys only; undefined when empty. */
export function normalizeColors(v: unknown): BlockColors | undefined {
  const out: BlockColors = {};
  for (const [k, val] of Object.entries(obj(v)).slice(0, 24)) {
    const h = hex(val, "");
    if (/^[a-zA-Z]{1,24}$/.test(k) && h) out[k] = h;
  }
  return Object.keys(out).length ? out : undefined;
}

/** CSS variables for a set of colors. `skipDefaults` leaves out colors that
 *  match the built-in value (the site theme; a block override always counts,
 *  since the site theme may have moved away from the default). */
export function themeVars(brand: string, colors: BlockColors | undefined, skipDefaults = false): Record<string, string> {
  const out: Record<string, string> = {};
  if (!colors) return out;
  for (const t of themeTokens(brand)) {
    const v = colors[t.key];
    if (!v || (skipDefaults && v.toLowerCase() === t.value.toLowerCase())) continue;
    for (const name of t.vars) out[name] = v;
  }
  return out;
}

/** The site theme as a stylesheet (":root{…}"), or "" when it's all
 *  default. `all` states every color given, defaults too (the preview, which
 *  must override a published theme). */
export function themeCss(brand: string, palette: BlockColors | undefined, all = false): string {
  const vars = Object.entries(themeVars(brand, palette, !all));
  return vars.length ? `:root{${vars.map(([k, v]) => `${k}:${v}`).join(";")}}` : "";
}

/** The site palette, every token filled (theme over built-in). */
export function themePalette(brand: string, palette: BlockColors | undefined): BlockColors {
  return Object.fromEntries(themeTokens(brand).map((t) => [t.key, palette?.[t.key] ?? t.value]));
}

/** A block wrapper's inline style: its color variables plus, with a section
 *  background, the background itself. Undefined when the block has none. */
export function blockStyle(brand: string, colors: BlockColors | undefined): Record<string, string> | undefined {
  if (!colors) return undefined;
  const style: Record<string, string> = themeVars(brand, colors);
  if (colors[SECTION_BG]) style.backgroundColor = colors[SECTION_BG];
  return Object.keys(style).length ? style : undefined;
}

export function canBeWidget(type: PageBlockType): boolean {
  const info = BLOCK_INFO[type];
  return !info.locked && !info.single && type !== "widget";
}

/** Normalize the fields of one block (id/hidden handled by the caller).
 *  Returns null for an unknown type. */
export type BlockFields = PageBlock extends infer B ? (B extends PageBlock ? Omit<B, "id" | "hidden" | "colors"> : never) : never;

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
        title: text(r.title, 160),
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
      return {
        type: "story_cover",
        frames: list(r.frames, LIMITS.frames)
          .map((x, i): StoryFrame => {
            const o = obj(x);
            return { id: itemId(o, "frame", i), name: str(o.name, 60), image: safeImage(o.image), href: safeHref(o.href) };
          })
          .filter((f) => f.image),
      };
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
            tone: pick(o.tone, ["blush", "ink", "plain"] as const, "blush"),
            label: str(o.label, 40),
            title: str(o.title, 80),
            body: text(o.body, 400),
            email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? email : "",
            phone: str(o.phone, 30).replace(/[^\d+()\-. ]/g, ""),
            details: text(o.details, 400),
            linkLabel: str(o.linkLabel, 40),
            linkHref: safeHref(o.linkHref),
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
    case "living_hero":
      return { type: "living_hero" };
    case "collection_showcase":
      return {
        type: "collection_showcase",
        eyebrow: str(r.eyebrow, 60),
        heading: str(r.heading, 100),
        lede: text(r.lede, 500),
        linkLabel: str(r.linkLabel, 40),
        comfort: strings(r.comfort, 4, 120),
      };
    case "seed_band":
      return {
        type: "seed_band",
        eyebrow: str(r.eyebrow, 60),
        heading: text(r.heading, 120),
        html: sanitizeRichHtml(r.html, 4000),
        items: list(r.items, LIMITS.seeds)
          .map((x, i): SeedItem => {
            const o = obj(x);
            return { id: itemId(o, "seed", i), name: str(o.name, 40), note: str(o.note, 200) };
          })
          .filter((x) => x.name),
        ctaLabel: str(r.ctaLabel, 40),
        ctaHref: safeHref(r.ctaHref),
      };
    case "seed_cards":
      return {
        type: "seed_cards",
        eyebrow: str(r.eyebrow, 60),
        heading: str(r.heading, 100),
        items: list(r.items, LIMITS.seeds)
          .map((x, i): SeedCard => {
            const o = obj(x);
            return { id: itemId(o, "seed", i), name: str(o.name, 40), origin: str(o.origin, 200), body: text(o.body, 600) };
          })
          .filter((x) => x.name),
        closingHeading: str(r.closingHeading, 100),
        closingBody: text(r.closingBody, 400),
        ctaLabel: str(r.ctaLabel, 40),
        ctaHref: safeHref(r.ctaHref),
      };
    case "statement":
      return { type: "statement", eyebrow: str(r.eyebrow, 60), heading: text(r.heading, 160), body: text(r.body, 600) };
    case "checklist":
      return {
        type: "checklist",
        eyebrow: str(r.eyebrow, 60),
        heading: str(r.heading, 100),
        intro: text(r.intro, 600),
        items: strings(r.items, LIMITS.checklist, 200),
        marker: pick(r.marker, ["check", "leaf"] as const, "check"),
      };
    case "two_lists":
      return {
        type: "two_lists",
        eyebrow: str(r.eyebrow, 60),
        heading: text(r.heading, 120),
        leftTitle: str(r.leftTitle, 60),
        leftItems: strings(r.leftItems, LIMITS.listItems, 120),
        rightTitle: str(r.rightTitle, 60),
        rightItems: strings(r.rightItems, LIMITS.listItems, 120),
      };
    case "pillars":
      return {
        type: "pillars",
        items: list(r.items, LIMITS.pillars)
          .map((x, i): Pillar => {
            const o = obj(x);
            return { id: itemId(o, "pillar", i), title: str(o.title, 80), body: text(o.body, 600) };
          })
          .filter((x) => x.title || x.body),
      };
    case "link_grid":
      return {
        type: "link_grid",
        eyebrow: str(r.eyebrow, 60),
        heading: str(r.heading, 100),
        items: list(r.items, LIMITS.linkGrid)
          .map((x, i) => {
            const o = obj(x);
            return { id: itemId(o, "link", i), label: str(o.label, 60), href: safeHref(o.href) };
          })
          .filter((x) => x.label),
      };
    case "link_cards":
      return {
        type: "link_cards",
        cards: list(r.cards, LIMITS.linkCards).map((x, i): LinkCard => {
          const o = obj(x);
          return {
            id: itemId(o, "card", i),
            eyebrow: str(o.eyebrow, 60),
            title: str(o.title, 100),
            body: text(o.body, 300),
            href: safeHref(o.href),
          };
        }),
      };
    case "faq":
      return {
        type: "faq",
        heading: str(r.heading, 100),
        items: list(r.items, LIMITS.faqs)
          .map((x, i): FaqItem => {
            const o = obj(x);
            return { id: itemId(o, "faq", i), q: str(o.q, 200), a: text(o.a, 1200) };
          })
          .filter((x) => x.q),
      };
    case "quiz": {
      const keys = new Set(QUIZ_PERSONAS.map((q) => q.key));
      const weights = (v: unknown): Record<string, number> => {
        const o = obj(v);
        const out: Record<string, number> = {};
        for (const k of Object.keys(o)) {
          const n = Math.round(Number(o[k]));
          if (keys.has(k) && Number.isFinite(n) && n > 0) out[k] = Math.min(5, n);
        }
        return out;
      };
      return {
        type: "quiz",
        cardLabel: str(r.cardLabel, 40),
        personas: list(r.personas, QUIZ_PERSONAS.length)
          .map((x): QuizPersonaCopy => {
            const o = obj(x);
            return {
              key: str(o.key, 20),
              name: str(o.name, 40),
              tag: str(o.tag, 160),
              scent: str(o.scent, 60),
              crown: text(o.crown, 400),
              part: str(o.part, 40),
              slug: str(o.slug, 80).replace(/[^a-z0-9-]/gi, ""),
              image: safeImage(o.image),
              surface: hex(o.surface, "#FFFFFF"),
              ink: hex(o.ink, "#2E2428"),
              accent: hex(o.accent, "#E8488E"),
              accentInk: hex(o.accentInk, "#FFFFFF"),
            };
          })
          .filter((x) => keys.has(x.key)),
        questions: list(r.questions, 8).map((x, i): QuizQuestion => {
          const o = obj(x);
          return {
            id: itemId(o, "q", i),
            prompt: str(o.prompt, 200),
            options: list(o.options, 6).map((y, j): QuizOption => {
              const p = obj(y);
              return { id: itemId(p, "o", j), label: str(p.label, 120), weights: weights(p.weights) };
            }),
          };
        }),
        scentPrompt: str(r.scentPrompt, 200),
        scentOptions: list(r.scentOptions, QUIZ_PERSONAS.length)
          .map((x, i): QuizScentOption => {
            const o = obj(x);
            return { id: itemId(o, "scent", i), label: str(o.label, 60), persona: str(o.persona, 20) };
          })
          .filter((x) => keys.has(x.persona)),
      };
    }
    case "announcement":
      return {
        type: "announcement",
        retail: strings(r.retail, LIMITS.announcements, 140),
        wholesale: strings(r.wholesale, LIMITS.announcements, 140),
      };
    case "footer":
      return {
        type: "footer",
        tagline: text(r.tagline, 300),
        subscribeEyebrow: str(r.subscribeEyebrow, 40),
        subscribeText: str(r.subscribeText, 160),
        columns: list(r.columns, LIMITS.footerColumns).map((x, i): FooterColumn => {
          const o = obj(x);
          return {
            id: itemId(o, "col", i),
            heading: str(o.heading, 40),
            links: list(o.links, LIMITS.footerLinks)
              .map((y, j): FooterLink => {
                const l = obj(y);
                return { id: itemId(l, "link", j), label: str(l.label, 60), href: safeHref(l.href) };
              })
              .filter((l) => l.label && l.href),
          };
        }),
        sisterEyebrow: str(r.sisterEyebrow, 60),
        sisterName: str(r.sisterName, 60),
        sisterHref: safeHref(r.sisterHref),
        sisterBlurb: str(r.sisterBlurb, 200),
        copyright: str(r.copyright, 160),
      };
    case "widget": {
      const widgetId = str(r.widgetId, 40);
      return /^[0-9a-f-]{36}$/i.test(widgetId) ? { type: "widget", widgetId } : null;
    }
    case "embed": {
      const kind = pick(r.kind, EMBED_KINDS, "video");
      const ends = Date.parse(str(r.endsAt, 40));
      return {
        type: "embed",
        kind,
        source: str(r.source, 500),
        heading: str(r.heading, 100),
        caption: text(r.caption, 300),
        endsAt: Number.isFinite(ends) ? new Date(ends).toISOString() : "",
        endedText: str(r.endedText, 160),
        ctaLabel: str(r.ctaLabel, 40),
        ctaHref: safeHref(r.ctaHref),
      };
    }
    case "theme":
      return { type: "theme", palette: normalizeColors(r.palette) ?? {} };
    case "collections_copy":
      return {
        type: "collections_copy",
        items: list(r.items, 20)
          .map((x): CollectionCopy => {
            const o = obj(x);
            return {
              slug: str(o.slug, 60).replace(/[^a-z0-9-]/gi, ""),
              name: str(o.name, 60),
              tagline: str(o.tagline, 80),
              description: text(o.description, 600),
              notes: strings(o.notes, 3, 60),
              heroLabel: str(o.heroLabel, 60),
              heroTitle: str(o.heroTitle, 60),
              heroAccent: str(o.heroAccent, 60),
              heroDescription: text(o.heroDescription, 600),
              heroCta: str(o.heroCta, 40),
              heroInvitation: str(o.heroInvitation, 120),
              heroKicker: str(o.heroKicker, 80),
              heroLine: str(o.heroLine, 120),
            };
          })
          .filter((x) => x.slug),
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
  const colors = fields.type === "theme" ? undefined : normalizeColors(r.colors);
  return { id, ...hidden, ...(colors ? { colors } : {}), ...fields } as PageBlock;
}

// ── pages ──────────────────────────────────────────────────────────────────

export type SitePageDef = {
  slug: string;
  label: string;
  /** Where it lives on the site (shown in the editor). */
  path: string;
  group: string;
  /** One-line explanation in the editor. */
  note: string;
  /** Block types editors may add (locked blocks come from the default). */
  addable: PageBlockType[];
  /** Fixed pages: fields only — no adding, deleting or reordering. */
  fixed?: boolean;
  defaults: PageBlock[];
};

/**
 * Coerce anything into a valid block list for `page`: unknown or
 * not-allowed types dropped, every locked block of the default present
 * exactly once (missing ones restored from the default), pinned blocks
 * first, single-use blocks deduped. Fixed pages keep the default's blocks
 * and order — only their fields come from the input. A hero with no usable
 * slides gets the default's slides. Null for input that isn't an array.
 */
export function normalizePageFor(page: SitePageDef, input: unknown): PageBlock[] | null {
  if (!Array.isArray(input)) return null;
  const ids = new Set<string>();
  const lockedTypes = new Set(page.defaults.filter((b) => BLOCK_INFO[b.type].locked).map((b) => b.type));
  const allowed = new Set<PageBlockType>([...pageAddable(page), ...lockedTypes]);

  const seen = new Set<PageBlockType>();
  const out: PageBlock[] = [];
  for (const raw of input.slice(0, LIMITS.blocks)) {
    const b = normalizeBlock(raw, ids);
    if (!b || !allowed.has(b.type)) continue;
    const info = BLOCK_INFO[b.type];
    if ((info.locked || info.single) && seen.has(b.type)) continue;
    seen.add(b.type);
    out.push(b);
  }

  if (page.fixed) {
    return page.defaults.map((d) => out.find((b) => b.type === d.type) ?? d);
  }

  // Restore missing locked blocks at their default position.
  page.defaults.forEach((d, i) => {
    if (lockedTypes.has(d.type) && !seen.has(d.type)) out.splice(Math.min(i, out.length), 0, d);
  });
  const defaultHero = page.defaults.find((b): b is HeroBlock => b.type === "hero");
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.type === "hero" && b.slides.length === 0 && defaultHero) out[i] = { ...b, slides: defaultHero.slides };
  }
  const pinned = out.filter((b) => BLOCK_INFO[b.type].pinned);
  return [...pinned, ...out.filter((b) => !BLOCK_INFO[b.type].pinned)];
}

/** Inline text segments: *accent*, [label](/link) and line breaks. */
export type InlineSeg =
  | { t: "text"; v: string }
  | { t: "em"; v: string }
  | { t: "link"; v: string; href: string }
  | { t: "br" };

/**
 * Parse the tiny inline syntax editors may use in titles and short lines:
 * `*words*` (accent / italic), `[label](/path)` (link — same allow-list as
 * every other link) and line breaks. Renderers map segments to elements, so
 * nothing here is HTML.
 */
export function parseInline(s: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  const re = /\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "em", v: m[1] });
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      out.push(href ? { t: "link", v: m[2], href } : { t: "text", v: m[2] });
    } else out.push({ t: "br" });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

/** Plain text of an inline string (for alt text, titles, summaries). */
export function inlinePlain(s: string): string {
  return parseInline(s)
    .map((x) => (x.t === "br" ? " " : x.v))
    .join("");
}

/** A fresh block of `type` for the editor's "Add block" menu: starter copy
 *  for the generic blocks, else a copy of the first default that has one. */
export function newBlockFor(type: PageBlockType, id: string, pages: SitePageDef[]): PageBlock {
  const fromDefaults = pages.flatMap((p) => p.defaults).find((b) => b.type === type);
  switch (type) {
    case "product_row":
      return { id, type, heading: "New arrivals", linkLabel: "Shop all →", linkHref: "/shop", source: "pick", parts: [], count: 4 };
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
        heading: "A heading",
        body: "Tell the story here.",
        ctaLabel: "Read more",
        ctaHref: "/story",
        tone: "blush",
      };
    case "rich_text":
      return { id, type, html: "<h2>A heading</h2><p>Write something here.</p>" };
    case "quote":
      return { id, type, eyebrow: "", text: "Something worth saying big.", highlight: "", footnote: "" };
    case "stats":
      return {
        id,
        type,
        items: [
          { id: "s1", value: "6", label: "Label" },
          { id: "s2", value: "100%", label: "Label" },
        ],
      };
    case "cta":
      return { id, type, heading: "Ready when you are.", primaryLabel: "Shop now", primaryHref: "/shop", secondaryLabel: "", secondaryHref: "" };
    case "callout":
      return { id, type, eyebrow: "heads up", heading: "A short heading", html: "<p>A sentence or two.</p>" };
    case "link_list":
      return { id, type, heading: "A list of links", subheading: "", items: [{ id: "l1", label: "First link", note: "", href: "/shop" }] };
    case "faq":
      return { id, type, heading: "More questions", items: [{ id: "q1", q: "A question?", a: "The answer." }] };
    case "checklist":
      return { id, type, eyebrow: "", heading: "A heading", intro: "", items: ["First point"], marker: "check" };
    case "statement":
      return { id, type, eyebrow: "", heading: "One big line.", body: "" };
    case "embed":
      return {
        id,
        type,
        kind: "video",
        source: "",
        heading: "",
        caption: "",
        endsAt: "",
        endedText: "",
        ctaLabel: "",
        ctaHref: "",
      };
    default:
      if (fromDefaults) return { ...structuredClone(fromDefaults), id } as PageBlock;
      return { id, type: "rich_text", html: "" };
  }
}

/** What an editor may add to a page: its own list plus widgets and embeds
 *  (fixed pages take neither). */
export function pageAddable(page: SitePageDef): PageBlockType[] {
  return page.fixed ? [] : [...page.addable, "embed", "widget"];
}

/**
 * Swap widget links for the widgets' content. `lookup` returns a widget's
 * raw block (published on the live site, draft in the preview). The result
 * keeps the LINK's id (so the editor can select it on the canvas) and hidden
 * flag; links to missing widgets, or widgets of a type the page can't take,
 * drop out.
 */
export function resolveWidgetRefs(
  blocks: PageBlock[],
  page: SitePageDef,
  lookup: (widgetId: string) => unknown,
): PageBlock[] {
  const allowed = new Set(pageAddable(page));
  const out: PageBlock[] = [];
  for (const b of blocks) {
    if (b.type !== "widget") {
      out.push(b);
      continue;
    }
    const fields = normalizeBlockFields(obj(lookup(b.widgetId)));
    if (!fields || fields.type === "widget" || !allowed.has(fields.type) || !canBeWidget(fields.type)) continue;
    // The link's own colors win; else the widget's.
    const colors = b.colors ?? normalizeColors(obj(lookup(b.widgetId)).colors);
    out.push({ ...fields, id: b.id, ...(b.hidden ? { hidden: true } : {}), ...(colors ? { colors } : {}) } as PageBlock);
  }
  return out;
}

/** Widget ids a page links to. */
export function widgetIds(blocks: PageBlock[]): string[] {
  return [...new Set(blocks.flatMap((b) => (b.type === "widget" ? [b.widgetId] : [])))];
}
