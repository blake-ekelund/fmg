/**
 * The prompt that asks Claude to write a blog post as OUR blog blocks — the
 * same vocabulary the builder edits and lib/blog/render.ts compiles. The
 * model only picks structure and writes copy; there are no style fields for
 * it to get wrong, and normalizeBlogBlocks() fixes up anything malformed and
 * applies the brand format (locked intro / closing) afterwards.
 */

import type { BlogBrand } from "@/lib/blogPosts";
import type { BlogImageCandidate } from "./generateImages";
import { BLOG_AUDIENCES, BLOG_PURPOSES, type BlogAudience, type BlogPurpose } from "./meta";

const VOICE: Record<BlogBrand, string> = {
  Sassy: [
    "Brand: Sassy (sassyandco.com) — bold, playful, confident body and fragrance products.",
    "Voice: best-friend energy with a wink; upbeat, casual, punchy. Short sentences. Readers are women 20–45 who like self-expression.",
    "Headings render in heavy uppercase, so keep them short (2–6 words).",
  ].join("\n"),
  NI: [
    "Brand: Natural Inspirations (naturalinspirations.com) — spa-inspired, clean personal care; the blog is 'the Journal'.",
    "Voice: warm, calm, sensory, quietly luxurious; never pushy or pretentious. Readers are women 35–65 who value clean ingredients and self-care rituals.",
    "Collections include Agave Pear, Coconut Ambre Vanille, Cyprès, Eucalyptus Rosemary Mint, Grapefruit Bergamot, Lavender Ylang, Orange Ginger, Sea Salt Citrus.",
    "Headings render in a serif display face — sentence case, evocative, not shouty.",
  ].join("\n"),
};

export const BLOG_BLOCK_VOCAB = `
BLOCKS (an ordered array; give each a unique "id" like "b1"). There are NO style fields — the site owns fonts, colours and spacing.

• intro     {"id","type":"intro","html":"<p>…</p>"} — REQUIRED, FIRST. The 1–3 sentence hook; on NI it renders as the lead paragraph.
• heading   {"id","type":"heading","level":2|3,"text":"…"} — h2 for main sections, h3 for sub-points.
• paragraph {"id","type":"paragraph","html":"<p>…</p>"} — inline <strong>, <em>, <a href> only. One paragraph per block, 2–4 sentences.
• list      {"id","type":"list","ordered":true|false,"items":["…","…"]} — steps or quick points; items may use <strong>.
• quote     {"id","type":"quote","text":"…","cite":""} — a pull-quote worth highlighting.
• image     {"id","type":"image","src":"<URL or empty>","alt":"…","caption":""}
• button    {"id","type":"button","text":"Shop the collection","url":"/collections"} — site-relative URLs are fine.
• product   {"id","type":"product","imageUrl":"<URL or empty>","name":"…","blurb":"…","price":"","url":"/shop"} — a product card.
• divider   {"id","type":"divider"}

SECTIONS (top level only; columns hold the blocks above):
• {"id","type":"section","layout":"imageText"|"textImage","columns":[{"blocks":[image]},{"blocks":[heading(level 3), paragraph, …]}]} — image beside words ("textImage" puts the words first).
• {"id","type":"section","layout":"twoColumn","columns":[{"blocks":[…]},{"blocks":[…]}]} — two parallel stacks (e.g. two products, before/after).
• {"id","type":"section","layout":"gallery","columns":[{"blocks":[image]},{"blocks":[image]},…]} — 2–3 images only.
• {"id","type":"section","layout":"callout","columns":[{"blocks":[heading(level 3), paragraph, …]}]} — a tinted box for a tip, ritual step, or offer.
`.trim();

export type BlogGenerateInput = {
  brand: BlogBrand;
  audience: BlogAudience;
  purpose: BlogPurpose;
  title: string;
  description: string;
  prompt: string;
  images: BlogImageCandidate[];
};

function imagesBlock(images: BlogImageCandidate[]): string {
  if (!images.length) {
    return `No hosted brand images are available. Leave every "src"/"imageUrl" as "" — the team adds photos in the builder. Still place image blocks where a photo belongs (usually 1–3 per post).`;
  }
  const line = (im: BlogImageCandidate) =>
    `- ${im.url}  (${[im.title, im.description || im.alt].filter(Boolean).join(" — ") || "no description"})`;
  const ours = images.filter((i) => i.source === "library");
  const stock = images.filter((i) => i.source === "unsplash");
  const parts = [
    `AVAILABLE IMAGES — copy URLs exactly, character for character; any other URL is discarded. Use them where they genuinely fit; if nothing fits a slot, leave it "".`,
  ];
  if (ours.length) {
    parts.push(`OUR BRAND IMAGES (products, packaging, brand shots — the only images allowed in product cards):\n${ours.map(line).join("\n")}`);
  }
  if (stock.length) {
    parts.push(
      `BRAND MOOD PHOTOGRAPHY from our Unsplash collection (lifestyle and atmosphere — for image, gallery, image-beside-text and the hero; NEVER in a product card; leave "caption" as "" — the photographer credit is added automatically):\n${stock.map(line).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

export function buildBlogGeneratePrompt(input: BlogGenerateInput): string {
  const audience = BLOG_AUDIENCES.find((a) => a.value === input.audience);
  const purpose = BLOG_PURPOSES.find((p) => p.value === input.purpose);
  const closing =
    input.brand === "Sassy"
      ? `End with a closing block: {"id","type":"closing","heading":"Shop the story","text":"one line","buttonText":"Shop now","url":"/shop"} — tailor the heading, line, and URL to the post.`
      : `Do NOT add a closing call-to-action — the NI journal page appends its own collection link after every post.`;

  return `You are the blog editor for a fragrance and personal-care brand. Write one complete, publish-ready blog post as structured blocks for our blog builder.

${VOICE[input.brand]}

Audience: ${audience ? `${audience.label} — ${audience.sub}` : "Shoppers"}.
Purpose: ${purpose ? `${purpose.label} — ${purpose.hint}` : "General"}.
Title (already chosen; do not repeat it as a heading): ${input.title}
${input.description ? `Summary: ${input.description}\n` : ""}
What the team wants:
"""
${input.prompt}
"""

${BLOG_BLOCK_VOCAB}

${imagesBlock(input.images)}

WRITING RULES:
- 600–1,000 words. Open with the intro, then 3–5 h2 sections. Vary the rhythm: at least one list or callout, and one image-beside-text section where a photo helps.
- ${closing}
- Real, finished copy — no placeholders, no "lorem", no brackets. Don't invent prices, discounts, awards, or medical claims.
- No emojis. Plain, confident sentences; the brand voice above.
- Links: site-relative paths like /shop, /collections, /blog are fine.

Also write:
- "seo_meta": 120–155 characters for Google and the blog index card.
- "tags": 2–4 short topical tags.
- "hero_image_url": one URL from the image lists for the top of the post, or "".

Return ONLY valid JSON, no prose or code fences, exactly:
{"seo_meta":"…","tags":["…"],"hero_image_url":"","blocks":[ … ]}`;
}
