/**
 * Grid sets — 6, 9 or 12 Instagram posts (2, 3 or 4 whole rows) that tell one
 * story and land as a finished block on the profile grid.
 *
 * Instagram shows the newest post top-left, so post 1 of a set ends up
 * bottom-right and the last post top-left: each grid ROW is a chapter, read
 * bottom row first. Tiles alternate bold brand graphics and photo-led tiles in
 * a checkerboard anchored top-left (the last post is always bold), so the
 * finished block looks deliberate; slot jobs are written to work on either.
 *
 * Client-safe: the planner modal, the generate-grid route and the feed preview
 * all use it.
 */

import type { PostDesign } from "./design";
import type { SlideTone } from "./theme";

export type GridRows = 2 | 3 | 4;
export const GRID_ROWS: GridRows[] = [2, 3, 4];

export type GridSlot = {
  /** Short label shown on the plan ("Hook", "How-to"). */
  role: string;
  /** What this post has to do in the story — goes into the AI prompt. */
  job: string;
  format: "single" | "carousel";
  slides: number;
};

export type GridChapter = { name: string; slots: GridSlot[] };

const single = (role: string, job: string): GridSlot => ({ role, job, format: "single", slides: 1 });
const carousel = (role: string, job: string, slides: number): GridSlot => ({ role, job, format: "carousel", slides });

const SCENE: GridChapter = {
  name: "Set the scene",
  slots: [
    single("Hook", "Name the story's theme in one big, scroll-stopping line (over a photo on a LIGHT tile). It opens the whole set."),
    carousel("The why", "Explain the idea behind the story — the ingredient, ritual or feeling — so people care.", 5),
    single("Mood", "Show what the story FEELS like: a photo with little or no text — or, on a BOLD tile, one short sensory line on brand colour."),
  ],
};

const PROOF: GridChapter = {
  name: "The proof",
  slots: [
    single("Product", "Spotlight the one product at the heart of the story: the product slide with its real photo."),
    carousel("How-to", "The ritual or routine, step by step (a list slide), tied to the story.", 4),
    single("Social proof", "A quote. Only a real review if we gave you one; otherwise a short brand line, meta = brand name."),
  ],
};

const OFFER: GridChapter = {
  name: "The occasion",
  slots: [
    carousel("Gift guide", "Who each product in the story is for — a guide people save and share. No invented discounts.", 5),
    single("Pairing", "Two products or a scent + body care pairing that belongs together in this story."),
    single("Reminder", "A short, warm nudge to act — the occasion or moment the team described. No invented deadlines or offers."),
  ],
};

const PAYOFF: GridChapter = {
  name: "The payoff",
  slots: [
    carousel("Collection", "The products in this story, one per slide, ending on a cta slide.", 5),
    single("Moment", "The payoff of the story, the feeling of having it: a photo light on text — or, on a BOLD tile, one short line on brand colour."),
    single("Invitation", "Close the story and invite them in. It sits top-left — the first thing profile visitors see."),
  ],
};

/** The chapters for each set size, in posting order (bottom row first). */
export function gridChapters(rows: GridRows): GridChapter[] {
  if (rows === 2) {
    return [
      SCENE,
      { name: "The payoff", slots: [PROOF.slots[0], PAYOFF.slots[0], PAYOFF.slots[2]] },
    ];
  }
  if (rows === 3) return [SCENE, PROOF, PAYOFF];
  return [SCENE, PROOF, OFFER, PAYOFF];
}

export function gridSlots(rows: GridRows): (GridSlot & { chapter: string })[] {
  return gridChapters(rows).flatMap((c) => c.slots.map((s) => ({ ...s, chapter: c.name })));
}

/** Where post `n` (1-based) of a `total`-post set sits once the set is complete. */
export function gridPosition(n: number, total: number): { row: number; col: number } {
  const p = total - n; // 0 = top-left
  return { row: Math.floor(p / 3), col: p % 3 };
}

/** Checkerboard: bold brand-colour tiles alternate with light / photo-led tiles. */
export function gridTileStyle(n: number, total: number): "bold" | "light" {
  const { row, col } = gridPosition(n, total);
  return (row + col) % 2 === 0 ? "bold" : "light";
}

/** First-slide tone that makes the checkerboard. */
export function gridTone(n: number, total: number, current: SlideTone): SlideTone {
  if (gridTileStyle(n, total) === "bold") return "dark";
  return current === "dark" ? "light" : current;
}

/** About one post every day and a half: day offsets 0, 2, 3, 5, 6, 8, … */
export const GRID_SPACING_DAYS = 1.5;

export function gridDayOffsets(total: number): number[] {
  return Array.from({ length: total }, (_, i) => Math.round(i * GRID_SPACING_DAYS));
}

/** Posting times for a set starting on `startDay` (yyyy-mm-dd) at `time` (HH:mm), local time. */
export function gridSchedule(total: number, startDay: string, time: string): Date[] {
  const [y, m, d] = startDay.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return gridDayOffsets(total).map((off) => new Date(y, m - 1, d + off, hh || 0, mm || 0));
}

/** Saved on each post's design so the set can be recognised later. */
export type GridMeta = {
  /** Shared by every post in the set. */
  id: string;
  story: string;
  /** 1-based posting order. */
  slot: number;
  size: number;
  role: string;
};

export function normalizeGridMeta(input: unknown): GridMeta | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const slot = Number(r.slot);
  const size = Number(r.size);
  if (typeof r.id !== "string" || !r.id || !Number.isInteger(slot) || !Number.isInteger(size) || size % 3 !== 0) return null;
  return {
    id: r.id.slice(0, 60),
    story: typeof r.story === "string" ? r.story.slice(0, 120) : "",
    slot: Math.max(1, Math.min(size, slot)),
    size: Math.min(12, Math.max(3, size)),
    role: typeof r.role === "string" ? r.role.slice(0, 40) : "",
  };
}

/** POST /api/social/generate-grid responses. */
export type GridPitch = { themes: { title: string; pitch: string }[] };
export type GridDraft = {
  story: { title: string; arc: string };
  posts: { title: string; role: string; chapter: string; design: PostDesign }[];
};
/** Split-image sets: captions only — the planner slices the picture itself. */
export type GridCaptions = {
  story: { title: string; arc: string };
  captions: { title: string; caption: import("./design").CaptionParts }[];
};

/* ─── Split one picture across the grid ───────────────────────────── */

/**
 * Each post is 1080×1350 (4:5) but the profile grid shows only its centre
 * 3:4 (1012.5 px wide). So the visible pieces join edge to edge, and each
 * post carries a 33.75 px bleed from its neighbours on both sides.
 */
export const MOSAIC_VISIBLE_W = (1350 * 3) / 4;
export const MOSAIC_BLEED = (1080 - MOSAIC_VISIBLE_W) / 2;
/** The picture area for `rows` rows, in post pixels (bleed included). */
export function mosaicSize(rows: GridRows): { w: number; h: number } {
  return { w: MOSAIC_VISIBLE_W * 3 + MOSAIC_BLEED * 2, h: 1350 * rows };
}
/** Where post `n`'s 1080×1350 slice starts in the picture (post pixels). */
export function mosaicSlice(n: number, total: number): { x: number; y: number } {
  const { row, col } = gridPosition(n, total);
  return { x: col * MOSAIC_VISIBLE_W, y: row * 1350 };
}
