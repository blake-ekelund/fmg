import Anthropic from "@anthropic-ai/sdk";
import { previewForVision } from "./optimize";

/**
 * Sage drafts a title, alt text and description for an image, so every photo
 * is findable (Image Library search, Sage, AI generators) and has real alt
 * text on the storefronts / in emails (SEO, accessibility, AI search).
 * SERVER ONLY. Staff can edit everything afterwards; we never overwrite a
 * field someone filled in (see registry.describeAndSave).
 */

const MODEL = "claude-opus-5-5";

export type ImageContext = {
  brand?: string | null;
  productName?: string | null;
  fragrance?: string | null;
  photoType?: string | null; // front / lifestyle / fragrance …
  folder?: string | null;
  fileName?: string | null;
};

export type ImageDescription = { title: string; altText: string; description: string };

const SYSTEM = `You write image metadata for a small personal-care brand company (brands: "Sassy + Co" — lip butters, hand cremes, body care; "Natural Inspirations" — bath & body). The text is used as:
- title: a short human name for the image in a photo library (3–8 words, Title Case, no file extensions).
- altText: HTML alt text for shoppers using screen readers and for search engines. One sentence, ≤ 125 characters, describes what is visibly in the image. Name the product and scent when known. Never start with "Image of" or "Photo of". No keyword stuffing, no marketing claims, no prices.
- description: 1–2 plain sentences (≤ 300 characters) for staff and AI tools: what the image shows, setting/props/colors, and what it suits (e.g. product page hero, lifestyle social post, email header).
Use the provided context (brand, product, fragrance, photo type) as facts; don't invent product names or ingredients you can't see or weren't given. If text on the packaging is legible, you may use it.`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    altText: { type: "string" },
    description: { type: "string" },
  },
  required: ["title", "altText", "description"],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;

export function describeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function describeImage(image: Buffer, ctx: ImageContext): Promise<ImageDescription | null> {
  if (!describeConfigured()) return null;
  client ??= new Anthropic();

  const facts = [
    ctx.brand && `Brand: ${ctx.brand}`,
    ctx.productName && `Product: ${ctx.productName}`,
    ctx.fragrance && `Fragrance: ${ctx.fragrance}`,
    ctx.photoType && `Photo type: ${ctx.photoType}`,
    ctx.folder && `Library folder: ${ctx.folder}`,
    ctx.fileName && `Original file name: ${ctx.fileName}`,
  ].filter(Boolean);

  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    // If a safety classifier declines (rare false positive on product shots), retry on Opus 4.8.
    fallbacks: [{ model: "claude-opus-4-8" }],
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await previewForVision(image) } },
          { type: "text", text: facts.length ? `Context:\n${facts.join("\n")}` : "No extra context." },
        ],
      },
    ],
  });

  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  try {
    const out = JSON.parse(text.text) as ImageDescription;
    return {
      title: out.title.trim().slice(0, 120),
      altText: out.altText.trim().slice(0, 160),
      description: out.description.trim().slice(0, 500),
    };
  } catch {
    return null;
  }
}
