import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { gatherImageCandidates, type ImageCandidate } from "@/lib/generatorImages";
import { trackUnsplashDownload } from "@/lib/unsplash";
import { isCanvas, normalizeCaption, normalizeDesign, type DesignSource, type ProductOption } from "@/lib/social/design";
import { blogBlock, checkDesignImages, listBrandProducts } from "@/lib/social/generate";
import { buildGridPrompt, buildMosaicPrompt, buildPitchPrompt } from "@/lib/social/generateGrid";
import { collectionBlock, listSiteCollections, productsInCollection } from "@/lib/social/collections";
import { loadBlogForSocial } from "@/lib/social/fromBlog";
import {
  GRID_ROWS,
  gridSlots,
  gridTone,
  type GridCaptions,
  type GridDraft,
  type GridPitch,
  type GridRows,
} from "@/lib/social/gridPlan";
import { isSocialBrand, type SocialBrand } from "@/lib/social/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const MAX_THEME_CHARS = 3000;
/** Base64 of the downscaled picture the planner sends for split-image captions. */
const MAX_IMAGE_B64 = 4_000_000;

/**
 * POST /api/social/generate-grid — a 6/9/12-post Instagram grid set
 * (lib/social/gridPlan.ts).
 *
 * Body: { action, brand, rows: 2|3|4, theme?, startDay: "yyyy-mm-dd",
 *         blogId? | collection? (what the set is about), image?, spread? }
 *   pitch   → { themes: [{title, pitch}] } — three ideas / angles (theme = optional hint)
 *   write   → { story, posts[] } — every post's slides + caption in posting order,
 *             first-slide tones forced into the grid checkerboard, images checked
 *             against what we offered.
 *   mosaic  → { story, captions[] } — captions for one picture split across the
 *             grid (image = base64 JPEG of the whole crop; the planner slices it).
 * Never writes the DB; the planner creates the drafts once the team likes the set.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ error: "AI generation isn't configured (ANTHROPIC_API_KEY is missing on the server)." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const brand = isSocialBrand(body.brand) ? body.brand : "NI";
  const rows = (GRID_ROWS.includes(Number(body.rows) as GridRows) ? Number(body.rows) : 3) as GridRows;
  const theme = typeof body.theme === "string" ? body.theme.trim().slice(0, MAX_THEME_CHARS) : "";
  const startDay = typeof body.startDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDay) ? body.startDay : new Date().toISOString().slice(0, 10);
  const total = rows * 3;

  const allProducts = await listBrandProducts(brand);
  const src = await loadSource(brand, body, allProducts);
  if ("error" in src) return NextResponse.json({ error: src.error }, { status: 404 });
  const catalog = [...new Set(allProducts.map((p) => p.name))].slice(0, 40);

  if (body.action === "pitch") {
    const json = await ask(buildPitchPrompt({ brand, rows, hint: theme, catalog, startDay, source: src.block }), 4000);
    if ("error" in json) return NextResponse.json({ error: json.error }, { status: json.status });
    const themes = Array.isArray(json.data.themes) ? json.data.themes : [];
    const clean = themes
      .map((t: { title?: unknown; pitch?: unknown } | null) => ({
        title: typeof t?.title === "string" ? t.title.trim().slice(0, 80) : "",
        pitch: typeof t?.pitch === "string" ? t.pitch.trim().slice(0, 400) : "",
      }))
      .filter((t) => t.title)
      .slice(0, 3);
    if (!clean.length) return NextResponse.json({ error: "No ideas came back. Try again." }, { status: 502 });
    return NextResponse.json({ themes: clean } satisfies GridPitch);
  }

  if (body.action === "mosaic") {
    const image = typeof body.image === "string" ? body.image.replace(/^data:image\/\w+;base64,/, "") : "";
    if (!image || image.length > MAX_IMAGE_B64) return NextResponse.json({ error: "Upload a picture first." }, { status: 400 });
    const prompt = buildMosaicPrompt({ brand, rows, theme, source: src.block, spread: body.spread !== false });
    const json = await ask(
      [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
        { type: "text", text: prompt },
      ],
      16000,
    );
    if ("error" in json) return NextResponse.json({ error: json.error }, { status: json.status });
    const raw = Array.isArray(json.data.posts) ? json.data.posts : [];
    if (raw.length < total) return NextResponse.json({ error: `The AI wrote ${raw.length} of ${total} captions. Try again.` }, { status: 502 });
    const story = readStory(json.data, "The big picture");
    const captions: GridCaptions["captions"] = raw.slice(0, total).map((p: { title?: unknown; caption?: unknown } | null, i) => ({
      title: typeof p?.title === "string" && p.title.trim() ? p.title.trim().slice(0, 60) : `${story.title} · piece ${i + 1}`,
      caption: normalizeCaption(p?.caption),
    }));
    return NextResponse.json({ story, captions } satisfies GridCaptions);
  }

  // Products with photos are offered for product slides; the rest by name only.
  // About a collection: its products come first.
  const pool = src.products ? [...src.products, ...allProducts.filter((p) => !src.products!.includes(p))] : allProducts;
  const featured = pool.filter((p) => p.images.length).slice(0, 14);
  const images = await gatherImageCandidates([brand], { library: 40, stock: 30 });
  const sourceImages = src.images ?? [];

  const json = await ask(
    buildGridPrompt({ brand, rows, theme, startDay, products: featured, catalog, images, source: src.block, sourceImages }),
    64000,
  );
  if ("error" in json) return NextResponse.json({ error: json.error }, { status: json.status });

  const rawPosts = Array.isArray(json.data.posts) ? json.data.posts : [];
  if (rawPosts.length < total) {
    return NextResponse.json({ error: `The AI wrote ${rawPosts.length} of ${total} posts. Try again.` }, { status: 502 });
  }

  const story = readStory(json.data, "Grid story");
  const setId = newSetId();
  const slots = gridSlots(rows);
  const usedUnsplash = new Map<string, ImageCandidate>();

  const posts: GridDraft["posts"] = [];
  for (let i = 0; i < total; i++) {
    const raw = rawPosts[i] as { title?: unknown; slides?: unknown; caption?: unknown };
    const slot = slots[i];
    const normalized = normalizeDesign({ slides: raw?.slides, caption: raw?.caption });
    if (!normalized) return NextResponse.json({ error: `Post ${i + 1} came back empty. Try again.` }, { status: 502 });
    normalized.slides = normalized.slides.slice(0, slot.format === "single" ? 1 : slot.slides + 1);

    const checked = checkDesignImages(normalized, [...sourceImages, ...images], featured);
    for (const u of checked.usedUnsplash) usedUnsplash.set(u.url, u);
    const design = checked.design;
    const first = design.slides[0];
    if (first && !isCanvas(first)) design.slides[0] = { ...first, tone: gridTone(i + 1, total, first.tone) };
    design.grid = { id: setId, story: story.title, slot: i + 1, size: total, role: slot.role };
    if (src.designSource) design.source = src.designSource;

    posts.push({
      title: typeof raw?.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 60) : `${story.title} · ${slot.role}`,
      role: slot.role,
      chapter: slot.chapter,
      design,
    });
  }

  await Promise.allSettled([...usedUnsplash.values()].flatMap((p) => (p.downloadLocation ? [trackUnsplashDownload(p.downloadLocation)] : [])));
  return NextResponse.json({ story, posts } satisfies GridDraft);
}

function newSetId(): string {
  return `grid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function readStory(data: AiJson, fallback: string) {
  return {
    title: typeof data.story?.title === "string" && data.story.title.trim() ? data.story.title.trim().slice(0, 80) : fallback,
    arc: typeof data.story?.arc === "string" ? data.story.arc.trim().slice(0, 500) : "",
  };
}

type Source = {
  block?: string;
  /** About a collection: its products. */
  products?: ProductOption[];
  /** About a blog post: its photos. */
  images?: ImageCandidate[];
  designSource?: DesignSource;
};

/** What the set is about: a blog article (any status) or a site collection. */
async function loadSource(
  brand: SocialBrand,
  body: Record<string, unknown>,
  products: ProductOption[],
): Promise<Source | { error: string }> {
  if (typeof body.blogId === "string" && body.blogId) {
    const blog = await loadBlogForSocial(body.blogId);
    if (!blog) return { error: "That blog post couldn't be found." };
    return {
      block: blogBlock(blog).replace("build this post FROM", "build the whole set FROM"),
      images: blog.images,
      designSource: { kind: "blog", id: blog.id, title: blog.title, url: blog.url },
    };
  }
  if (typeof body.collection === "string" && body.collection) {
    const c = (await listSiteCollections(brand)).find((x) => x.slug === body.collection);
    if (!c) return { error: "That collection couldn't be found." };
    const inIt = productsInCollection(brand, c.slug, products);
    return { block: collectionBlock(c, inIt), products: inIt };
  }
  return {};
}

type AiJson = { themes?: unknown; posts?: unknown; story?: { title?: unknown; arc?: unknown } };

async function ask(
  content: string | Anthropic.Beta.BetaContentBlockParam[],
  maxTokens: number,
): Promise<{ data: AiJson } | { error: string; status: number }> {
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await new Anthropic().beta.messages
      .stream({
        model: MODEL,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        output_config: { effort: "medium" },
        messages: [{ role: "user", content }],
      })
      .finalMessage();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI generation failed.", status: 502 };
  }
  if (message.stop_reason === "refusal") return { error: "The AI declined that one. Try rewording the story.", status: 422 };
  if (message.stop_reason === "max_tokens") return { error: "The set came out too long. Try again, or pick fewer rows.", status: 502 };

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { error: "Couldn't read what the AI wrote. Try again.", status: 502 };
  try {
    return { data: (JSON.parse(match[0]) ?? {}) as AiJson };
  } catch {
    return { error: "What the AI wrote wasn't valid. Try again.", status: 502 };
  }
}
