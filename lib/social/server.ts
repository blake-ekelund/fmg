/**
 * Shared bits for the /api/social routes. SERVER ONLY.
 */

import { compileCaption, normalizeDesign, slideProblems, type PostDesign } from "./design";
import {
  isSocialBrand,
  isSocialPlatform,
  isSocialPostType,
  normalizeMedia,
  SOCIAL_PLATFORMS,
  type SocialPost,
} from "./types";

export const SOCIAL_MIGRATION_HINT =
  "The social_posts table is missing — run supabase/migrations/20261008000000_social_posts.sql (npx supabase db push).";

export const DESIGN_MIGRATION_HINT =
  "Designed posts need the latest database update — run npx supabase db push (migration 20261008010000_social_post_design.sql).";

export function tableMissing(message: string): boolean {
  return /relation .*social_posts.* does not exist|Could not find the table .*social_posts/i.test(message);
}

export function designColumnMissing(message: string): boolean {
  return /column .*(design|title).* does not exist|Could not find the '(design|title)' column/i.test(message);
}

/** Editable fields from an untrusted request body; only keys that were sent. */
export function readPostFields(body: Record<string, unknown>): Partial<SocialPost> {
  const out: Partial<SocialPost> = {};
  if ("brand" in body && isSocialBrand(body.brand)) out.brand = body.brand;
  if ("post_type" in body && isSocialPostType(body.post_type)) out.post_type = body.post_type;
  if ("caption" in body && typeof body.caption === "string") out.caption = body.caption.slice(0, 70000);
  if ("media" in body) out.media = normalizeMedia(body.media);
  if ("title" in body && typeof body.title === "string") out.title = body.title.trim().slice(0, 200);
  if ("design" in body) out.design = body.design === null ? null : normalizeDesign(body.design);
  if ("platforms" in body && Array.isArray(body.platforms)) {
    // Keep a stable order regardless of click order.
    const set = new Set(body.platforms.filter(isSocialPlatform));
    out.platforms = SOCIAL_PLATFORMS.filter((p) => set.has(p));
  }
  if ("scheduled_at" in body) {
    const v = body.scheduled_at;
    if (v === null || v === "") out.scheduled_at = null;
    else if (typeof v === "string" && !Number.isNaN(Date.parse(v))) out.scheduled_at = new Date(v).toISOString();
  }
  return out;
}

/** Fields a design dictates: the compiled caption and the post type. */
export function designFields(design: PostDesign): Pick<SocialPost, "caption" | "post_type"> {
  return {
    caption: compileCaption(design.caption),
    post_type: design.slides.length === 1 ? "image" : "carousel",
  };
}

export function designProblems(design: PostDesign): string[] {
  return design.slides.flatMap((s, i) => slideProblems(s, i + 1));
}

