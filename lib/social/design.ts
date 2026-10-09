/**
 * Designed social posts — the slide builder's document model.
 *
 * A designed post is an ordered list of slides plus a structured caption.
 * Like blog blocks there are NO free style knobs: the brand theme owns fonts,
 * colors and spacing; a slide only picks a layout and one of three brand
 * tones. FMG renders each slide to an Instagram-ready 1080×1350 JPEG
 * (lib/social/renderSlides.tsx) with the same React component the editor
 * previews (components/marketing/social/SlideView.tsx), so what you see is
 * what posts.
 *
 * Client-safe.
 */

import type { SocialBrand } from "./types";
import { normalizeCanvasSlide, type CanvasSlide } from "./canvas";
import { normalizeGridMeta, type GridMeta } from "./gridPlan";
import { SLIDE_FONTS, SLIDE_H, SLIDE_THEMES, SLIDE_W, type SlideTheme, type SlideTone } from "./theme";

export { SLIDE_FONTS, SLIDE_H, SLIDE_THEMES, SLIDE_W, type SlideTheme };

export const SLIDES_MAX = 10;

/** Bump when SlideView's look changes so every slide re-renders. */
export const RENDER_VERSION = 1;

export type SlideLayout = "cover" | "photo" | "product" | "text" | "list" | "quote" | "cta";
export type { SlideTone } from "./theme";

export type Slide = {
  id: string;
  layout: SlideLayout;
  tone: SlideTone;
  /** Small label above the headline ("Ingredient spotlight"). */
  kicker: string;
  headline: string;
  /** Supporting line(s). Product: the benefit. Quote: unused. */
  body: string;
  /** List layout only, 2–5 short items. */
  items: string[];
  /** Quote layout: who said it. Product: the price ("$24"). CTA: the link text. */
  meta: string;
  /** Cover / photo / product. */
  image: string;
};

export type CaptionParts = {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
};

/** A slide in a post: a template layout (what the AI writes) or a free canvas (what the editor makes). */
export type DesignSlide = Slide | CanvasSlide;

export function isCanvas(s: DesignSlide): s is CanvasSlide {
  return (s as CanvasSlide).kind === "canvas";
}

/** Where an AI-generated post came from (shown in the builder). */
export type DesignSource = { kind: "blog"; id: string; title: string; url: string | null };

export type PostDesign = {
  slides: DesignSlide[];
  caption: CaptionParts;
  source?: DesignSource | null;
  /** Part of a 6/9/12-post grid set (lib/social/gridPlan.ts). */
  grid?: GridMeta | null;
};

export const LAYOUTS: { value: SlideLayout; label: string; hint: string; image: boolean }[] = [
  { value: "cover", label: "Cover", hint: "Photo with a big headline — the scroll-stopper", image: true },
  { value: "photo", label: "Photo", hint: "Full-bleed photo, optional one-line caption", image: true },
  { value: "product", label: "Product", hint: "Product shot, name, one benefit, price", image: true },
  { value: "text", label: "Text", hint: "A headline and a short paragraph", image: false },
  { value: "list", label: "List", hint: "Tips or steps, 2–5 lines", image: false },
  { value: "quote", label: "Quote", hint: "A pull quote or review", image: false },
  { value: "cta", label: "Call to action", hint: "Closing slide with the link", image: false },
];

export const TONES: { value: SlideTone; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "tint", label: "Tint" },
  { value: "dark", label: "Bold" },
];

/* ─── Constructors ─────────────────────────────────────────────────── */

export function newSlideId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const DEFAULT_TONE: Record<SlideLayout, SlideTone> = {
  cover: "dark",
  photo: "light",
  product: "tint",
  text: "light",
  list: "tint",
  quote: "dark",
  cta: "dark",
};

export function newSlide(layout: SlideLayout, brand: SocialBrand): Slide {
  const t = SLIDE_THEMES[brand];
  const base: Slide = {
    id: newSlideId(),
    layout,
    tone: DEFAULT_TONE[layout],
    kicker: "",
    headline: "",
    body: "",
    items: [],
    meta: "",
    image: "",
  };
  switch (layout) {
    case "cover":
      return { ...base, headline: "Your headline here" };
    case "text":
      return { ...base, headline: "A headline", body: "A short paragraph — two or three lines reads best." };
    case "list":
      return { ...base, headline: "A few tips", items: ["First tip", "Second tip", "Third tip"] };
    case "quote":
      return { ...base, headline: "A line worth quoting.", meta: "A happy customer" };
    case "product":
      return { ...base, headline: "Product name", body: "One benefit, in a sentence." };
    case "cta":
      return { ...base, headline: "Find your ritual", body: "Shop the collection", meta: t.site };
    default:
      return base;
  }
}

export function emptyCaption(): CaptionParts {
  return { hook: "", body: "", cta: "", hashtags: [] };
}

/** A blank three-slide carousel to start from. */
export function starterDesign(brand: SocialBrand, single = false): PostDesign {
  return {
    slides: single ? [newSlide("cover", brand)] : [newSlide("cover", brand), newSlide("text", brand), newSlide("cta", brand)],
    caption: emptyCaption(),
  };
}

/* ─── Normalizing (AI output, API input) ───────────────────────────── */

const LAYOUT_SET = new Set<SlideLayout>(LAYOUTS.map((l) => l.value));
const TONE_SET = new Set<SlideTone>(["light", "tint", "dark"]);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "");

export function normalizeSlides(input: unknown): DesignSlide[] {
  if (!Array.isArray(input)) return [];
  const out: DesignSlide[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (r.kind === "canvas") {
      const c = normalizeCanvasSlide(r);
      if (seen.has(c.id)) c.id = newSlideId();
      seen.add(c.id);
      out.push(c);
      if (out.length >= SLIDES_MAX) break;
      continue;
    }
    const layout = LAYOUT_SET.has(r.layout as SlideLayout) ? (r.layout as SlideLayout) : "text";
    let id = str(r.id, 60) || newSlideId();
    if (seen.has(id)) id = newSlideId();
    seen.add(id);
    const image = str(r.image, 2000);
    out.push({
      id,
      layout,
      tone: TONE_SET.has(r.tone as SlideTone) ? (r.tone as SlideTone) : DEFAULT_TONE[layout],
      kicker: str(r.kicker, 60),
      headline: str(r.headline, 140),
      body: str(r.body, 400),
      items: Array.isArray(r.items) ? r.items.map((i) => str(i, 120)).filter(Boolean).slice(0, 5) : [],
      meta: str(r.meta, 80),
      image: /^https:\/\//i.test(image) ? image : "",
    });
    if (out.length >= SLIDES_MAX) break;
  }
  return out;
}

export function normalizeCaption(input: unknown): CaptionParts {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const tags = Array.isArray(r.hashtags) ? r.hashtags : typeof r.hashtags === "string" ? r.hashtags.split(/[\s,]+/) : [];
  const hashtags: string[] = [];
  for (const t of tags) {
    const clean = String(t).trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (clean && !hashtags.some((h) => h.toLowerCase() === clean.toLowerCase())) hashtags.push(clean);
  }
  return {
    hook: str(r.hook, 300),
    body: str(r.body, 1800),
    cta: str(r.cta, 300),
    hashtags: hashtags.slice(0, 30),
  };
}

export function normalizeDesign(input: unknown): PostDesign | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const slides = normalizeSlides(r.slides);
  if (!slides.length) return null;
  const src = r.source as Record<string, unknown> | null | undefined;
  const source: DesignSource | null =
    src && src.kind === "blog" && typeof src.id === "string" && typeof src.title === "string"
      ? {
          kind: "blog",
          id: src.id.slice(0, 60),
          title: src.title.slice(0, 200),
          url: typeof src.url === "string" && /^https:\/\//.test(src.url) ? src.url.slice(0, 500) : null,
        }
      : null;
  const grid = normalizeGridMeta(r.grid);
  return { slides, caption: normalizeCaption(r.caption), ...(source ? { source } : {}), ...(grid ? { grid } : {}) };
}

/** The caption that actually posts: hook, body, CTA, then hashtags. */
export function compileCaption(c: CaptionParts): string {
  const parts = [c.hook, c.body, c.cta].map((p) => p.trim()).filter(Boolean);
  if (c.hashtags.length) parts.push(c.hashtags.map((h) => `#${h}`).join(" "));
  return parts.join("\n\n");
}

/** Problems that would make a slide look broken once rendered. */
export function slideProblems(s: DesignSlide, n: number): string[] {
  if (isCanvas(s)) {
    return s.layers.some((l) => !l.hidden) || s.bg.image ? [] : [`Slide ${n} is empty.`];
  }
  const p: string[] = [];
  const at = `Slide ${n}`;
  if ((s.layout === "photo" || s.layout === "product") && !s.image) p.push(`${at} needs an image.`);
  if (s.layout !== "photo" && !s.headline.trim()) p.push(`${at} needs a headline.`);
  if (s.layout === "list" && s.items.length < 2) p.push(`${at} needs at least two list items.`);
  return p;
}

/** Stable short hash (FNV-1a) — names a slide's render so unchanged slides are reused. */
export function slideHash(s: DesignSlide, brand: SocialBrand): string {
  const src = isCanvas(s)
    ? JSON.stringify([RENDER_VERSION, "canvas", s.bg, s.layers])
    : JSON.stringify([RENDER_VERSION, brand, s.layout, s.tone, s.kicker, s.headline, s.body, s.items, s.meta, s.image]);
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/* ─── Wizard choices + products (shared with lib/social/generate.ts) ─── */

export type SocialPurpose = "education" | "product" | "launch" | "community" | "seasonal" | "promo";

export const SOCIAL_PURPOSES: { value: SocialPurpose; label: string; hint: string }[] = [
  { value: "education", label: "Education", hint: "Teach something — ingredients, rituals, how-tos" },
  { value: "product", label: "Product spotlight", hint: "Show off one product or collection" },
  { value: "launch", label: "Launch / new", hint: "Tease or announce something new" },
  { value: "community", label: "Community", hint: "Reviews, questions, customer moments" },
  { value: "seasonal", label: "Seasonal moment", hint: "Holiday, season, gifting, self-care day" },
  { value: "promo", label: "Offer", hint: "A sale or promotion you describe" },
];

export function isSocialPurpose(v: unknown): v is SocialPurpose {
  return SOCIAL_PURPOSES.some((p) => p.value === v);
}

export type ProductOption = {
  part: string;
  name: string;
  fragrance: string | null;
  /** Storefront collection slug (Sassy: everyday / love / holiday). */
  collection?: string | null;
  size: string | null;
  price: number | null;
  blurb: string;
  /** Public product photos, front first. */
  images: { url: string; type: string }[];
};
