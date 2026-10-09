/**
 * AI social post generator — prompt, product context, and the image check.
 * SERVER ONLY.
 *
 * The model writes slides in OUR slide vocabulary (lib/social/design.ts) plus a
 * structured caption. It may only place images we offer it: real product
 * shots (from the product pages), our tagged Image Library photos, and the
 * brand's Unsplash photography (gatherImageCandidates — the same pool the
 * blog and email generators use). Every URL is checked afterwards.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import type { BlogForSocial } from "./fromBlog";
import type { ImageCandidate } from "@/lib/generatorImages";
import {
  SLIDE_THEMES,
  SLIDES_MAX,
  SOCIAL_PURPOSES,
  isCanvas,
  type PostDesign,
  type ProductOption,
  type SocialPurpose,
} from "./design";

export { isSocialPurpose } from "./design";
import type { SocialBrand, SocialPlatform } from "./types";

/* ─── Products ─────────────────────────────────────────────────────── */


type ProductRow = {
  part: string;
  display_name: string | null;
  fragrance: string | null;
  size: string | null;
  msrp: number | null;
  short_description: string | null;
  in_stock: boolean | null;
  assets: { asset_type?: string; storage_path?: string }[] | null;
};

const IMAGE_ORDER = ["front", "lifestyle", "benefits", "fragrance", "ingredients", "other"];

/** The brand's sellable products (published, not testers), in-stock first. */
export async function listBrandProducts(brand: SocialBrand): Promise<ProductOption[]> {
  const { data, error } = await supabaseServer
    .from("storefront_products")
    .select("part, display_name, fragrance, size, msrp, short_description, in_stock, assets")
    .eq("brand", brand)
    .eq("is_tester", false)
    .order("in_stock", { ascending: false })
    .order("display_name", { ascending: true })
    .order("part", { ascending: true })
    .limit(300);
  if (error || !data) return [];
  return (data as ProductRow[]).map((r) => {
    const assets = (r.assets ?? []).filter((a) => a.storage_path && /\.(jpe?g|png|webp)$/i.test(a.storage_path));
    assets.sort((a, b) => IMAGE_ORDER.indexOf(a.asset_type ?? "other") - IMAGE_ORDER.indexOf(b.asset_type ?? "other"));
    return {
      part: r.part,
      name: [r.fragrance, r.display_name].filter(Boolean).join(" "),
      fragrance: r.fragrance,
      size: r.size,
      price: r.msrp,
      blurb: (r.short_description ?? "").trim(),
      images: assets.map((a) => ({
        url: supabaseServer.storage.from("media-kit").getPublicUrl(a.storage_path!).data.publicUrl,
        type: a.asset_type ?? "other",
      })),
    };
  });
}

/* ─── Prompt ───────────────────────────────────────────────────────── */

const VOICE: Record<SocialBrand, string> = {
  NI: [
    "Brand: Natural Inspirations (NI Spa, naturalinspirations.com, Instagram @_naturalinspirations) — spa-inspired personal care.",
    "Voice: calm confidence with sensory warmth. Calm, warm, knowledgeable, refined, reassuring. Spa-inspired, nature-rooted language; sensory cues (scent, texture, feel). Never trendy, loud, clinical, fear-based, gimmicky or pushy. No medical claims or buzzwords.",
    "Audience: women 35–65 who value clean, fresh fragrance, spa-grade performance and ingredient integrity.",
    "Fragrance is described as clean, fresh, uplifting, comforting, balanced — the experience, not a list of notes.",
    "Philosophy: \"Indulge in the Good. Eliminate the Bad.\" ExSeed Deep Moisturizing Complex = cold-pressed pomegranate, cranberry, black cumin, carrot and grape seed oils (nearly 4x the antioxidants of the oils alone) — in all NI body care. Essence: Fresh. Nourishing. Elevated.",
    "Content pillars: education, awareness, launches, community. Products come up naturally, never as a hard sell.",
    "Slide headlines render in a serif display face — sentence case, evocative, short.",
    "Instagram: short lines that breathe, curated hashtags (5–12), no spammy tags. Emojis: none or one, subtle.",
  ].join("\n"),
  Sassy: [
    "Brand: Sassy (sassyandco.com) — bold, playful, confident body and fragrance products.",
    "Voice: best-friend energy with a wink; upbeat, casual, punchy. Short sentences. Readers are women 20–45 who like self-expression.",
    "Slide headlines render in heavy UPPERCASE — keep them very short (2–6 words).",
    "Instagram: punchy hook, a few emojis are fine, 5–12 hashtags mixing brand and discovery tags.",
  ].join("\n"),
};

export const SLIDE_VOCAB = `
SLIDES (an ordered array). Each slide: {"layout","tone","kicker","headline","body","items","meta","image"} — use "" / [] for fields a layout doesn't use. The brand owns fonts and colors; you only pick layout + tone.
• cover   — FIRST slide. Big headline over a photo (image strongly preferred). kicker = 1–3 word label, headline ≤ 8 words, body = optional one-line subhead.
• photo   — full-bleed photo; headline = optional short caption (≤ 8 words). Needs image.
• product — product shot on a card. headline = product name, body = ONE benefit sentence, meta = price like "$24" (only a price we give you), image = one of that product's photos.
• text    — kicker optional, headline ≤ 10 words, body 1–3 sentences (≤ 220 characters).
• list    — headline + items: 2–5 short lines (≤ 60 characters each). Steps, tips, reasons.
• quote   — headline = the quote (≤ 140 characters), meta = who said it. Only quote real text we give you; otherwise use a brand line, meta = brand name.
• cta     — LAST slide of a carousel. headline = short invitation, body = one line, meta = link text (e.g. the site).
tone: "light" | "tint" | "dark" — alternate for rhythm; cover and cta usually "dark".`.trim();

export type SocialGenerateInput = {
  brand: SocialBrand;
  purpose: SocialPurpose;
  platforms: SocialPlatform[];
  format: "carousel" | "single";
  slideCount: number;
  prompt: string;
  products: ProductOption[];
  /** Other products in the range, names only, for context. */
  catalog: string[];
  images: ImageCandidate[];
  /** Write the post FROM this blog article (any status). */
  blog?: BlogForSocial | null;
};

function blogBlock(b: BlogForSocial): string {
  const when = b.liveAt ? new Date(b.liveAt).toUTCString().replace(/:00 GMT$/, " UTC") : null;
  const timing =
    b.status === "published"
      ? `It is already live${b.url ? ` at ${b.url}` : ""}.`
      : b.status === "scheduled" && when
        ? `It goes live ${when}${b.url ? ` at ${b.url}` : ""}, and this social post will likely go out at the same time.`
        : "It is still a draft — write as if it is out (the team will time the post to match).";
  return [
    `SOURCE ARTICLE — build this post FROM our blog post below. Carry its message, its key points and its mood/vibe into the slides and caption; make people want to read the full article. Don't copy it word for word — distil it for a phone screen. Use the article's own photos first.`,
    `Title: ${b.title}`,
    b.summary ? `Summary: ${b.summary}` : "",
    b.tags.length ? `Tags: ${b.tags.join(", ")}` : "",
    timing,
    `Article text:
"""
${b.text}
"""`,
  ]
    .filter(Boolean)
    .join("\n");
}

function productsBlock(products: ProductOption[], catalog: string[]): string {
  const parts: string[] = [];
  if (products.length) {
    parts.push(
      `FEATURED PRODUCTS (the team picked these — feature them):\n` +
        products
          .map((p) =>
            [
              `- ${p.name}${p.size ? ` (${p.size})` : ""}${p.price != null ? ` — $${p.price}` : ""}`,
              p.blurb ? `  About: ${p.blurb}` : "",
              p.images.length ? `  Photos: ${p.images.map((i) => `${i.url} [${i.type}]`).join("  ")}` : "  Photos: none",
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n"),
    );
  }
  if (catalog.length) parts.push(`OTHER PRODUCTS IN THE RANGE (names only, for context):\n${catalog.join("; ")}`);
  return parts.join("\n\n");
}

function imagesBlock(images: ImageCandidate[], products: ProductOption[]): string {
  const line = (im: ImageCandidate) =>
    `- ${im.url}  (${[im.title, im.description || im.alt].filter(Boolean).join(" — ") || "no description"})`;
  const ours = images.filter((i) => i.source === "library");
  const stock = images.filter((i) => i.source === "unsplash");
  const parts = [
    `IMAGES — copy URLs exactly, character for character; any other URL is discarded. Prefer the featured products' own photos (lifestyle shots make great covers). If nothing fits a slot, use "".`,
  ];
  if (ours.length) parts.push(`OUR IMAGE LIBRARY (products, packaging, brand shots):\n${ours.map(line).join("\n")}`);
  if (stock.length) {
    parts.push(`BRAND MOOD PHOTOGRAPHY (Unsplash collection — atmosphere only; cover/photo slides, NEVER on a product slide):\n${stock.map(line).join("\n")}`);
  }
  if (!ours.length && !stock.length && !products.some((p) => p.images.length)) {
    return `No photos are available — choose text, list, quote and cta slides, and leave "image" as "".`;
  }
  return parts.join("\n\n");
}

export function buildSocialPrompt(input: SocialGenerateInput): string {
  const purpose = SOCIAL_PURPOSES.find((p) => p.value === input.purpose);
  const n = input.format === "single" ? 1 : Math.min(SLIDES_MAX, Math.max(2, input.slideCount));
  const where = input.platforms.map((p) => (p === "instagram" ? "Instagram" : "Facebook")).join(" and ") || "Instagram";
  const shape =
    n === 1
      ? `Exactly ONE slide — a "cover" (or "product" if it's a single product spotlight) that works on its own.`
      : `Exactly ${n} slides: start with "cover", end with "cta", and vary the middle (text, list, product, quote, photo) so it reads like a story you swipe through.`;

  return `You are the social media editor for a fragrance and personal-care brand. Write one finished ${n === 1 ? "single-image post" : "carousel post"} for ${where}.

${VOICE[input.brand]}

Purpose: ${input.blog ? "Promote our new blog article — drive people to read it." : purpose ? `${purpose.label} — ${purpose.hint}` : "General"}.

${input.blog ? blogBlock(input.blog) + "\n" : ""}
What the team wants:
"""
${input.prompt || (input.blog ? "Turn the article into a post that sends people to read it." : "")}
"""

${productsBlock(input.products, input.catalog)}

${SLIDE_VOCAB}

${shape}

${input.blog?.images.length ? `THE ARTICLE'S PHOTOS (use these first — cover, photo and product slides):
${input.blog.images.map((im) => `- ${im.url}  (${[im.title, im.alt].filter(Boolean).join(" — ")})`).join("\n")}

` : ""}${imagesBlock(input.images, input.products)}

CAPTION (posted under the slides) as parts:
- "hook": the first line — what shows before "more". ≤ 120 characters, makes them stop.
- "body": 2–5 short lines that add to the slides (don't just repeat them). Line breaks allowed.
- "cta": one line — what to do next. Instagram links aren't clickable: say "link in bio" or name the site (${SLIDE_THEMES[input.brand].site}).${input.blog ? " Point them to the full article (e.g. \"Read the full story — link in bio\")." : ""}
- "hashtags": 5–12 tags without "#", relevant and curated.
Whole caption ≤ 1,800 characters.

RULES:
- Real, finished copy — no placeholders or brackets. Don't invent prices, discounts, awards, reviews or medical claims; only use offers the team described.
- Keep slide text short — it's read on a phone in two seconds.

Also give the post a short internal "title" (≤ 60 characters) for the team's list.

Return ONLY valid JSON, no prose or code fences, exactly:
{"title":"…","slides":[ … ],"caption":{"hook":"…","body":"…","cta":"…","hashtags":["…"]}}`;
}

/* ─── Image check ──────────────────────────────────────────────────── */

/**
 * Blank any image URL we didn't offer. Unsplash photos may only sit on cover /
 * photo slides; product slides only take product photos or library images.
 */
export function checkDesignImages(
  design: PostDesign,
  images: ImageCandidate[],
  products: ProductOption[],
): { design: PostDesign; usedUnsplash: ImageCandidate[] } {
  const library = new Map(images.map((c) => [c.url, c]));
  const productUrls = new Set(products.flatMap((p) => p.images.map((i) => i.url)));
  const used = new Map<string, ImageCandidate>();

  const slides = design.slides.map((s) => {
    if (isCanvas(s)) return s; // the AI only writes layout slides
    const url = s.image.trim();
    if (!url) return s;
    if (productUrls.has(url)) return s;
    const c = library.get(url);
    if (!c) return { ...s, image: "" };
    if (c.source === "unsplash") {
      if (s.layout === "product") return { ...s, image: "" };
      used.set(c.url, c);
    }
    return s;
  });
  return { design: { ...design, slides }, usedUnsplash: [...used.values()] };
}
