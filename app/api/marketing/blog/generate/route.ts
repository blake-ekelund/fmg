import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fetchLibraryImages } from "@/lib/email/libraryImages";
import { isBlogBrand, normalizeTags } from "@/lib/blogPosts";
import { buildBlogGeneratePrompt } from "@/lib/blog/generatePrompt";
import { isBlogAudience, isBlogPurpose, starterTags } from "@/lib/blog/meta";
import { normalizeBlogBlocks } from "@/lib/blog/normalize";
import { checkGeneratedImages, type BlogImageCandidate } from "@/lib/blog/generateImages";
import { brandCollection, listPhotos, trackUnsplashDownload, unsplashConfigured } from "@/lib/unsplash";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5";
const MAX_PROMPT_CHARS = 4000;

/**
 * What the model may place: our tagged Image Library photos, plus the brand's
 * Unsplash collection (first page, 30 photos). Either half can come back empty
 * (no metadata rows yet, no Unsplash key) and generation still works.
 */
async function gatherImages(brand: string): Promise<BlogImageCandidate[]> {
  const collection = brandCollection(brand);
  const [library, stock] = await Promise.all([
    fetchLibraryImages(20),
    collection && unsplashConfigured()
      ? listPhotos(1, [collection]).then((r) => r.photos).catch(() => [])
      : Promise.resolve([]),
  ]);
  return [
    ...library.map((i): BlogImageCandidate => ({ ...i, source: "library" })),
    ...stock.map(
      (p): BlogImageCandidate => ({
        url: p.url,
        title: null,
        alt: p.alt,
        description: p.description,
        source: "unsplash",
        credit: `Photo by ${p.photographer.name} on Unsplash`,
        downloadLocation: p.downloadLocation,
      }),
    ),
  ];
}

/**
 * POST /api/marketing/blog/generate
 *
 * Body: { brand, audience, purpose, title, description?, prompt }
 * Returns: { blocks, seo_meta, tags, hero_image_url, image_credits } — a whole post in our
 * blog block vocabulary, already normalized into the brand's format. Does NOT
 * write the DB; the wizard creates the draft with it.
 *
 * Streams under the hood (a full post is long output) and opts into the
 * server-side refusal fallback so a rare false-positive decline still returns
 * a post.
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const brand = isBlogBrand(body.brand) ? body.brand : "Sassy";
  const audience = isBlogAudience(body.audience) ? body.audience : "d2c";
  const purpose = isBlogPurpose(body.purpose) ? body.purpose : "other";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";
  if (!prompt) {
    return NextResponse.json({ error: "Describe the post you want written." }, { status: 400 });
  }

  const images = await gatherImages(brand);

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
            content: buildBlogGeneratePrompt({ brand, audience, purpose, title, description, prompt, images }),
          },
        ],
      })
      .finalMessage();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI generation failed." },
      { status: 502 },
    );
  }

  if (message.stop_reason === "refusal") {
    return NextResponse.json(
      { error: "The AI declined to write that one. Try rewording the description." },
      { status: 422 },
    );
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "Couldn't read the generated post. Try again." }, { status: 502 });
  }
  let parsed: { blocks?: unknown; seo_meta?: unknown; tags?: unknown; hero_image_url?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: "The generated post wasn't valid. Try again." }, { status: 502 });
  }

  const normalized = normalizeBlogBlocks(parsed.blocks, brand);
  if (normalized.length <= 2) {
    return NextResponse.json(
      { error: "The AI didn't produce a usable post. Try adding more detail to the description." },
      { status: 422 },
    );
  }

  // Every image URL (hero included) must come from the list we offered;
  // Unsplash photos get their credit and are reported as used.
  const { blocks, hero, usedUnsplash } = checkGeneratedImages(
    normalized,
    typeof parsed.hero_image_url === "string" ? parsed.hero_image_url : "",
    images,
  );
  await Promise.allSettled(
    usedUnsplash.flatMap((p) => (p.downloadLocation ? [trackUnsplashDownload(p.downloadLocation)] : [])),
  );

  // Category / purpose tag leads so the NI journal files it correctly.
  const tags = normalizeTags([...starterTags(brand, purpose), ...(Array.isArray(parsed.tags) ? parsed.tags : [])]);

  return NextResponse.json({
    blocks,
    seo_meta: typeof parsed.seo_meta === "string" ? parsed.seo_meta.trim().slice(0, 300) : "",
    tags: tags ?? [],
    hero_image_url: hero,
    // The hero has no caption slot, so its credit (if Unsplash) rides along here.
    image_credits: usedUnsplash.map((p) => ({ url: p.url, credit: p.credit })),
  });
}
