/**
 * Build the prompt that asks Claude to compose an email out of OUR block
 * vocabulary — the same blocks and section layouts the editor saves and
 * `renderBlocks` renders. The model's only job is to emit that block JSON;
 * `normalizeBlocks` then guarantees it's valid, so this prompt optimises for
 * good design choices, not for schema safety.
 *
 * Keep the block list here aligned with components/templates/types.ts. Even if
 * it drifts, the normalizer coerces the output — but an accurate list means the
 * model actually uses sections, captions, and promotions instead of guessing.
 */

import { BRAND_PRESETS, type Brand, type Channel, type TemplatePurpose } from "@/components/templates/types";
import { mergeGroupsFor } from "./mergeFields";

const BRAND_VOICE: Record<"ni" | "sassy", string> = {
  ni: "Warm, spa-inspired, luxurious but approachable — women 35-65 who value clean beauty and self-care rituals. Nurturing and elegant, never pretentious.",
  sassy: "Bold, playful, confident, best-friend energy with a wink — women 20-45 who embrace self-expression. Casual, upbeat.",
};

export type LibraryImage = { url: string; title: string | null; alt: string | null; description: string | null };

export type GenerateInput = {
  brand: Brand;
  channel: Channel;
  purpose: TemplatePurpose[];
  /** The user's free-text description of the email they want. */
  prompt: string;
  /** Optional working title for context. */
  name?: string;
  /** Brand images the model may place (from the Image Library). */
  images?: LibraryImage[];
};

function brandBlock(brand: Brand): string {
  if (brand === "both") {
    return [
      "Brand: Both (brand-neutral). Use restrained, neutral colours.",
      `Natural Inspirations voice — ${BRAND_VOICE.ni}`,
      `Sassy voice — ${BRAND_VOICE.sassy}`,
    ].join("\n");
  }
  const p = BRAND_PRESETS[brand];
  return [
    `Brand: ${p.name}`,
    `Tagline: "${p.tagline}"`,
    `Voice: ${BRAND_VOICE[brand]}`,
    `Colours — primary ${p.primaryColor}, secondary ${p.secondaryColor}, background ${p.bgColor}, text ${p.textColor}. Use these for block bgColor/textColor/accent choices.`,
    `Preferred body font family: "${p.fontFamily}".`,
  ].join("\n");
}

/** The block + layout vocabulary. Compact JSON shapes, one per line.
    Exported so the grade-fix prompt speaks the same block language. */
export const BLOCK_VOCAB = `
BLOCKS (emit an ordered array; every block needs a unique "id" like "b1"):

• header   {"id","type":"header","logoUrl":"","companyName":"...","bgColor":"#hex","textColor":"#hex","padding":20}
• text     {"id","type":"text","html":"<p>...</p>","fontSize":15,"fontFamily":"sans|serif|mono","textAlign":"left|center|right","textColor":"#hex","bgColor":"#hex","padding":20}
• button   {"id","type":"button","text":"Shop Now","url":"https://...","bgColor":"#hex","textColor":"#hex","align":"left|center|right","borderRadius":8,"fontSize":16,"padding":20}
• image    {"id","type":"image","src":"<URL or empty>","alt":"...","width":"full|half|third","align":"center","linkUrl":"","borderRadius":0,"padding":10}
• caption  {"id","type":"caption","imageUrl":"<URL or empty>","alt":"...","heading":"...","subheading":"...","layout":"overlay|below|above","textAlign":"center","verticalAlign":"middle","textColor":"#hex","bgColor":"#hex","scrim":30,"fontSize":26,"minHeight":220,"padding":0}
• hero     {"id","type":"hero","imageUrl":"<URL or empty>","heading":"...","subheading":"...","buttonText":"...","buttonUrl":"https://...","overlay":true,"textColor":"#hex","padding":0}
• product  {"id","type":"product","imageUrl":"<URL or empty>","name":"...","description":"...","price":"$24.00","buttonText":"Shop Now","buttonUrl":"https://...","bgColor":"#hex","padding":20}
• promotion{"id","type":"promotion","headline":"...","description":"...","promoCode":"CODE","discountLabel":"20% OFF","expiresLabel":"Ends April 30","buttonText":"Shop Now","buttonUrl":"https://...","bgColor":"#hex","accentColor":"#hex","textColor":"#hex","padding":24}
• divider  {"id","type":"divider","color":"#e5e7eb","thickness":1,"style":"solid","padding":10}
• spacer   {"id","type":"spacer","height":24}
• social   {"id","type":"social","align":"center","facebook":"","instagram":"","tiktok":"","website":"","padding":20}
• footer   {"id","type":"footer","text":"You're receiving this because you're a Fragrance Marketing Group customer.","unsubscribeLabel":"Unsubscribe","bgColor":"#hex","textColor":"#hex","linkColor":"#hex","fontSize":12,"textAlign":"center","padding":20} — compliance footer; the unsubscribe link is wired automatically. Optional: a plain fallback is auto-appended when absent.

LAYOUTS — a "section" is a 1–3 column container with its own background; each column holds a stack of the blocks above. THIS is how you build side-by-side layouts (e.g. two products, or image beside text):
• section  {"id","type":"section","bgColor":"","bgImage":"","padding":24,"gap":20,"stackOnMobile":true,"verticalAlign":"middle","columns":[ {"weight":1,"bgColor":"","verticalAlign":"middle","padding":12,"blocks":[ ...blocks... ]}, ... ]}

Common section shapes: image + text (two columns, an image block beside a header+text+button stack); two/three product columns; a full-width coloured band (one column, section bgColor set).

SPACING: any block or section may include "marginTop"/"marginBottom" (px, may be negative to tuck closer). Positive space renders in every inbox; negative overlap is best-effort.
`.trim();

function imagesBlock(images: LibraryImage[]): string {
  if (!images.length) {
    return `No hosted brand images are available. Leave every "src"/"imageUrl" as "" (the user adds images later). Prefer CAPTION blocks with a brand bgColor over empty image/hero blocks, since a caption still reads with no image.`;
  }
  const list = images
    .slice(0, 30)
    .map((im) => `- ${im.url}  (${[im.title, im.description || im.alt].filter(Boolean).join(" — ") || "no description"})`)
    .join("\n");
  return `AVAILABLE BRAND IMAGES — you MAY use these exact URLs in image/hero/caption/product blocks when they fit. Do NOT invent other image URLs; if none fit, leave the field "" or use a caption block on a brand colour.\n${list}`;
}

export function buildGeneratePrompt(input: GenerateInput): string {
  const mergeTokens = mergeGroupsFor(input.channel)
    .flatMap((g) => g.fields.map((f) => `{{${f.key}}} (${f.label})`))
    .join(", ");

  const audience =
    input.channel === "wholesale" ? "wholesale retail buyers/accounts"
    : input.channel === "d2c" ? "direct-to-consumer shoppers"
    : "a general audience (wholesale + D2C)";

  return `You are an expert email marketing designer and copywriter. Compose a complete marketing email as a structured array of blocks for our email builder.

${brandBlock(input.brand)}

Audience: ${audience}.
Purpose: ${input.purpose.join(", ") || "general"}.
${input.name ? `Working title: ${input.name}\n` : ""}
What the user wants:
"""
${input.prompt}
"""

${BLOCK_VOCAB}

${imagesBlock(input.images ?? [])}

MERGE FIELDS — you may personalise with these exact tokens; they're substituted at send. Only use tokens from this list, verbatim: ${mergeTokens || "none"}.

DESIGN RULES:
- Open with a header (logo/name), then a strong hero or caption, well-structured body content, a clear call-to-action button, and a social footer.
- Reach for SECTION layouts for anything side-by-side (image beside text, product grids) — don't stack everything full-width.
- Use CAPTION blocks (image + live text) where a headline sits on a photo — they stay readable even if images are blocked.
- Use the brand colours; keep copy on-brand and tight.
- NEVER use emojis. Use typographic symbols (•, —, →, ★) for emphasis.
- Only use image URLs from the AVAILABLE BRAND IMAGES list; otherwise leave image fields "".
- Write real, finished copy — no placeholders like "lorem" or "[insert]".

Also write a compelling "subject" and short "preview_text".

Return ONLY valid JSON, no prose or code fences, in exactly this shape:
{"subject":"...","preview_text":"...","blocks":[ ... ]}`;
}
