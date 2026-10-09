import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { gatherImageCandidates } from "@/lib/generatorImages";
import { trackUnsplashDownload } from "@/lib/unsplash";
import { normalizeDesign } from "@/lib/social/design";
import {
  buildSocialPrompt,
  checkDesignImages,
  isSocialPurpose,
  listBrandProducts,
} from "@/lib/social/generate";
import { isSocialBrand, isSocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
const MAX_PROMPT_CHARS = 3000;

/**
 * POST /api/social/generate
 *
 * Body: { brand, purpose, platforms, format: "carousel"|"single", slideCount, prompt, parts? }
 * Returns: { title, design } — slides + caption parts in our vocabulary, images
 * limited to the featured products' photos, the Image Library and the brand's
 * Unsplash photography. Does NOT write the DB; the wizard creates the draft.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "AI generation isn't configured (ANTHROPIC_API_KEY is missing on the server)." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const brand = isSocialBrand(body.brand) ? body.brand : "NI";
  const purpose = isSocialPurpose(body.purpose) ? body.purpose : "education";
  const platforms = Array.isArray(body.platforms) ? body.platforms.filter(isSocialPlatform) : ["instagram" as const];
  const format = body.format === "single" ? "single" : "carousel";
  const slideCount = Math.round(Number(body.slideCount) || 5);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";
  const parts = Array.isArray(body.parts) ? body.parts.filter((p): p is string => typeof p === "string").slice(0, 4) : [];
  if (!prompt) return NextResponse.json({ error: "Describe the post you want." }, { status: 400 });

  const [allProducts, images] = await Promise.all([
    listBrandProducts(brand),
    gatherImageCandidates([brand], { library: 25, stock: 25 }),
  ]);
  const featured = allProducts.filter((p) => parts.includes(p.part));
  const catalog = [...new Set(allProducts.filter((p) => !parts.includes(p.part)).map((p) => p.name))].slice(0, 40);

  let message: Anthropic.Beta.BetaMessage;
  try {
    const client = new Anthropic();
    message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        output_config: { effort: "medium" },
        messages: [
          {
            role: "user",
            content: buildSocialPrompt({ brand, purpose, platforms, format, slideCount, prompt, products: featured, catalog, images }),
          },
        ],
      })
      .finalMessage();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI generation failed." }, { status: 502 });
  }

  if (message.stop_reason === "refusal") {
    return NextResponse.json({ error: "The AI declined to write that one. Try rewording the description." }, { status: 422 });
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Couldn't read the generated post. Try again." }, { status: 502 });

  let parsed: { title?: unknown; slides?: unknown; caption?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: "The generated post wasn't valid. Try again." }, { status: 502 });
  }

  const normalized = normalizeDesign({ slides: parsed.slides, caption: parsed.caption });
  if (!normalized) {
    return NextResponse.json({ error: "The AI didn't produce any slides. Try adding more detail." }, { status: 422 });
  }
  if (format === "single") normalized.slides = normalized.slides.slice(0, 1);

  const { design, usedUnsplash } = checkDesignImages(normalized, images, featured);
  await Promise.allSettled(
    usedUnsplash.flatMap((p) => (p.downloadLocation ? [trackUnsplashDownload(p.downloadLocation)] : [])),
  );

  return NextResponse.json({
    title: typeof parsed.title === "string" ? parsed.title.trim().slice(0, 120) : "",
    design,
  });
}
