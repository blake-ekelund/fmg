/**
 * AI grid sets — prompts for a 6/9/12-post Instagram story (lib/social/gridPlan.ts).
 * SERVER ONLY. Reuses the single-post generator's brand voice, slide
 * vocabulary, product and image blocks (lib/social/generate.ts) so a set reads
 * and looks like the posts made one at a time.
 */

import type { ImageCandidate } from "@/lib/generatorImages";
import { SLIDE_THEMES, type ProductOption } from "./design";
import { SLIDE_VOCAB, VOICE, imagesBlock, productsBlock } from "./generate";
import { gridChapters, gridPosition, gridSlots, gridTileStyle, type GridRows } from "./gridPlan";
import type { SocialBrand } from "./types";

const POSITION = [
  ["top-left", "top-middle", "top-right"],
  ["second row left", "second row middle", "second row right"],
  ["third row left", "third row middle", "third row right"],
  ["bottom row left", "bottom row middle", "bottom row right"],
];

function where(n: number, total: number): string {
  const { row, col } = gridPosition(n, total);
  const rows = total / 3;
  // Name the last row "bottom" whatever the set size.
  const r = row === rows - 1 ? 3 : row;
  return POSITION[r][col];
}

/** Ask for three story ideas the team can pick from. */
export function buildPitchPrompt(input: {
  brand: SocialBrand;
  rows: GridRows;
  hint: string;
  catalog: string[];
  startDay: string;
  /** A blog article or site collection the set must be about (sourceBlock text). */
  source?: string;
}): string {
  const n = input.rows * 3;
  return `You are the social media editor for a fragrance and personal-care brand, planning the next ${n} Instagram posts as ONE connected story (about ${Math.round(n * 1.5)} days of posting, starting ${input.startDay}).

${VOICE[input.brand]}

PRODUCTS IN THE RANGE: ${input.catalog.join("; ") || "(none listed)"}

${input.source ? `${input.source}

Pitch three different ANGLES on this source.
` : ""}${input.hint ? `The team's starting thought:\n"""\n${input.hint}\n"""\n` : ""}
Pitch THREE different story ideas. Each needs a short title (≤ 6 words) and a one-to-two sentence pitch that says what the arc is and which products it features. Consider the time of year. Don't invent sales, discounts or launches.

Return ONLY valid JSON, no prose or code fences:
{"themes":[{"title":"…","pitch":"…"}]}`;
}

export function buildGridPrompt(input: {
  brand: SocialBrand;
  rows: GridRows;
  theme: string;
  startDay: string;
  products: ProductOption[];
  catalog: string[];
  images: ImageCandidate[];
  /** A blog article or site collection the set must be about (sourceBlock text). */
  source?: string;
  /** The source article's own photos (offered first). */
  sourceImages?: ImageCandidate[];
}): string {
  const total = input.rows * 3;
  const chapters = gridChapters(input.rows);
  const slots = gridSlots(input.rows);
  const site = SLIDE_THEMES[input.brand].site;

  const plan = slots
    .map((s, i) => {
      const n = i + 1;
      const bold = gridTileStyle(n, total) === "bold";
      const shape =
        s.format === "single"
          ? `ONE slide`
          : `${s.slides} slides — start with "cover", end with "cta"`;
      const look = bold
        ? `BOLD tile: first slide tone "dark" — a brand-colour graphic (cover, text or quote on colour, or a product card on dark)`
        : `LIGHT tile: first slide is photo-led (cover, photo or product with an image), tone "light" or "tint" — never "dark"`;
      return `Post ${n} — ${s.role} [chapter: ${s.chapter}] — grid spot once the set is complete: ${where(n, total)}
  Job: ${s.job}
  Format: ${shape}.
  Look: ${look}.`;
    })
    .join("\n\n");

  return `You are the social media editor for a fragrance and personal-care brand. Write the next ${total} Instagram posts as ONE connected story. They go out about every day and a half starting ${input.startDay}, in the order below.

${VOICE[input.brand]}

${input.source ? `${input.source}

` : ""}THE STORY${input.source ? " — the team's angle / notes" : ""}:
"""
${input.theme || (input.source ? "Unpack the source above across the set — one idea per post, building as you go." : "Choose a fitting story for this time of year that features our products naturally.")}
"""

HOW THE GRID WORKS — design for it:
- Instagram shows the newest post top-left, so post 1 ends up bottom-right and post ${total} top-left. Each grid ROW is a chapter (${chapters.map((c, i) => `posts ${i * 3 + 1}–${i * 3 + 3}: ${c.name}`).join("; ")}).
- On the grid only each post's FIRST slide shows, cropped to 3:4 from the centre — keep first-slide headlines short and central.
- Tiles alternate BOLD brand-colour graphics and LIGHT photo-led tiles in a checkerboard. Follow each post's Look.
- Never use the same photo as the first slide of two posts. Spread different photos across the set.
- The posts must read as one story: shared language, a recurring phrase or motif, each post picking up where the last left off — but each must also make sense on its own in someone's feed.

THE POSTS:

${plan}

${productsBlock(input.products, input.catalog)}

${SLIDE_VOCAB}

${input.sourceImages?.length ? `THE ARTICLE'S PHOTOS (use these first):
${input.sourceImages.map((im) => `- ${im.url}  (${[im.title, im.alt].filter(Boolean).join(" — ")})`).join("\n")}

` : ""}${imagesBlock(input.images, input.products)}

CAPTIONS — each post gets its own caption as parts:
- "hook": the first line, ≤ 120 characters.
- "body": 2–5 short lines that add to the slides. It may nod to the earlier posts in the story.
- "cta": one line. Instagram links aren't clickable: say "link in bio" or name the site (${site}).
- "hashtags": 5–12 tags without "#". Use ONE shared story hashtag on every post, plus post-specific tags.
Each caption ≤ 1,800 characters.

RULES:
- Real, finished copy — no placeholders or brackets. Don't invent prices, discounts, awards, reviews, deadlines or medical claims; only use offers the team described.
- Slide text is read on a phone in two seconds — keep it short.

Return ONLY valid JSON, no prose or code fences, exactly:
{"story":{"title":"… (≤ 6 words)","arc":"… one or two sentences"},"posts":[{"title":"… internal name ≤ 60 chars","slides":[ … ],"caption":{"hook":"…","body":"…","cta":"…","hashtags":["…"]}}, … exactly ${total} posts in posting order]}`;
}

/**
 * Captions for a picture split across the grid. Each post is one slice of the
 * photo (Claude sees the whole picture); the captions tell one story in
 * posting order and explain the puzzle to people who see a single slice.
 */
export function buildMosaicPrompt(input: { brand: SocialBrand; rows: GridRows; theme: string; source?: string; spread: boolean }): string {
  const total = input.rows * 3;
  const site = SLIDE_THEMES[input.brand].site;
  const tiles = Array.from({ length: total }, (_, i) => `Post ${i + 1} = the ${where(i + 1, total)} piece`).join("\n");
  return `You are the social media editor for a fragrance and personal-care brand. The attached picture is being split into ${total} Instagram posts (${input.rows} rows × 3) so that, on our profile grid, the pieces join back into this one big picture.

${VOICE[input.brand]}

${input.source ? `${input.source}

` : ""}${input.theme ? `The team's notes:
"""
${input.theme}
"""

` : ""}POSTING ORDER — Instagram shows the newest post top-left, so we post the bottom-right piece first and the top-left piece last:
${tiles}
${input.spread ? "They go out about every day and a half, so the picture builds up over a couple of weeks — let the captions build anticipation (\"piece 3 of 9 — watch our grid\")." : "They all go out within an hour, so the picture appears at once — each caption can stand alone and point people to the grid."}

Write one caption per post, in posting order. In someone's feed each post shows only its slice, so captions should make sense alone and invite people to see the full picture on our profile. Look at what each piece shows and let its caption relate to it when that helps. Together the captions tell one story.

Each caption as parts:
- "hook": the first line, ≤ 120 characters.
- "body": 1–4 short lines.
- "cta": one line. Instagram links aren't clickable: say "link in bio" or name the site (${site}).
- "hashtags": 5–10 tags without "#", one shared tag on every post.
Don't invent prices, discounts, awards, reviews, deadlines or medical claims.

Also a short internal "title" (≤ 60 characters) per post, and a story title (≤ 6 words) + one-sentence arc for the set.

Return ONLY valid JSON, no prose or code fences:
{"story":{"title":"…","arc":"…"},"posts":[{"title":"…","caption":{"hook":"…","body":"…","cta":"…","hashtags":["…"]}}, … exactly ${total} in posting order]}`;
}
