import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { gatherImageCandidates } from "@/lib/generatorImages";
import { trackUnsplashDownload } from "@/lib/unsplash";
import { isCanvas, normalizeDesign } from "@/lib/social/design";
import { checkDesignImages, listBrandProducts } from "@/lib/social/generate";
import { buildGridPrompt, buildPitchPrompt } from "@/lib/social/generateGrid";
import { GRID_ROWS, gridSlots, gridTone, type GridDraft, type GridPitch, type GridRows } from "@/lib/social/gridPlan";
import { isSocialBrand } from "@/lib/social/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const MAX_THEME_CHARS = 3000;

/**
 * POST /api/social/generate-grid — a 6/9/12-post Instagram story set
 * (lib/social/gridPlan.ts).
 *
 * Body: { action: "pitch" | "write", brand, rows: 2|3|4, theme?, startDay: "yyyy-mm-dd" }
 *   pitch → { themes: [{title, pitch}] } — three story ideas (theme = optional hint)
 *   write → { story, posts[] } — every post's slides + caption in posting order,
 *           first-slide tones forced into the grid checkerboard, images checked
 *           against what we offered. Does NOT write the DB; the planner creates
 *           the drafts once the team likes the set.
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
  const catalog = [...new Set(allProducts.map((p) => p.name))].slice(0, 40);

  if (body.action === "pitch") {
    const json = await ask(buildPitchPrompt({ brand, rows, hint: theme, catalog, startDay }), 4000);
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

  // Products with photos are offered for product slides; the rest by name only.
  const featured = allProducts.filter((p) => p.images.length).slice(0, 14);
  const images = await gatherImageCandidates([brand], { library: 40, stock: 30 });

  const json = await ask(buildGridPrompt({ brand, rows, theme, startDay, products: featured, catalog, images }), 64000);
  if ("error" in json) return NextResponse.json({ error: json.error }, { status: json.status });

  const rawPosts = Array.isArray(json.data.posts) ? json.data.posts : [];
  if (rawPosts.length < total) {
    return NextResponse.json({ error: `The AI wrote ${rawPosts.length} of ${total} posts. Try again.` }, { status: 502 });
  }

  const story = {
    title: typeof json.data.story?.title === "string" ? json.data.story.title.trim().slice(0, 80) : "Grid story",
    arc: typeof json.data.story?.arc === "string" ? json.data.story.arc.trim().slice(0, 500) : "",
  };
  const setId = `grid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const slots = gridSlots(rows);
  const usedUnsplash = new Map<string, (typeof images)[number]>();

  const posts: GridDraft["posts"] = [];
  for (let i = 0; i < total; i++) {
    const raw = rawPosts[i] as { title?: unknown; slides?: unknown; caption?: unknown };
    const slot = slots[i];
    const normalized = normalizeDesign({ slides: raw?.slides, caption: raw?.caption });
    if (!normalized) return NextResponse.json({ error: `Post ${i + 1} came back empty. Try again.` }, { status: 502 });
    normalized.slides = normalized.slides.slice(0, slot.format === "single" ? 1 : slot.slides + 1);

    const checked = checkDesignImages(normalized, images, featured);
    for (const u of checked.usedUnsplash) usedUnsplash.set(u.url, u);
    const design = checked.design;
    const first = design.slides[0];
    if (first && !isCanvas(first)) design.slides[0] = { ...first, tone: gridTone(i + 1, total, first.tone) };
    design.grid = { id: setId, story: story.title, slot: i + 1, size: total, role: slot.role };

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

type AiJson = { themes?: unknown; posts?: unknown; story?: { title?: unknown; arc?: unknown } };

async function ask(prompt: string, maxTokens: number): Promise<{ data: AiJson } | { error: string; status: number }> {
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await new Anthropic().beta.messages
      .stream({
        model: MODEL,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        output_config: { effort: "medium" },
        messages: [{ role: "user", content: prompt }],
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
