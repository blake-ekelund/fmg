/**
 * Social posts (Facebook Pages + Instagram via the Meta Graph API).
 *
 * Client-safe: types, limits and validation shared by the composer on
 * /marketing/social and the API routes / publisher (lib/social/publish.ts).
 */

export type SocialBrand = "Sassy" | "NI";
export type SocialPlatform = "instagram" | "facebook";
export type SocialPostType = "image" | "carousel" | "reel";
export type SocialStatus = "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
export type MediaKind = "image" | "video";

export type SocialMedia = { url: string; kind: MediaKind };

export type PlatformResult = {
  status: "pending" | "published" | "failed";
  /** Published post/media id on that platform. */
  id?: string;
  permalink?: string;
  /** Instagram container still processing (reels) — resumed next cron tick. */
  container_id?: string;
  error?: string;
  at?: string;
};

export type SocialPost = {
  id: string;
  brand: SocialBrand;
  platforms: SocialPlatform[];
  post_type: SocialPostType;
  caption: string;
  media: SocialMedia[];
  status: SocialStatus;
  scheduled_at: string | null;
  claimed_at: string | null;
  attempts: number;
  results: Partial<Record<SocialPlatform, PlatformResult>>;
  last_error: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /api/social/status — which Page / IG account each brand posts to. */
export type BrandConnection = {
  brand: SocialBrand;
  ok: boolean;
  facebook: { id: string; name: string } | null;
  instagram: { id: string; username: string | null; quota: { used: number; total: number } | null } | null;
  error: string | null;
};
export type MetaConnectionStatus = {
  configured: boolean;
  brands: BrandConnection[];
  /** Only while a brand has no Page id yet — helps fill in META_PAGE_ID_*. */
  visiblePages?: { id: string; name: string; instagram: string | null }[];
  visiblePagesError?: string;
};

export const SOCIAL_BRANDS: SocialBrand[] = ["Sassy", "NI"];
export const SOCIAL_PLATFORMS: SocialPlatform[] = ["instagram", "facebook"];
export const SOCIAL_POST_TYPES: SocialPostType[] = ["image", "carousel", "reel"];

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};
export const POST_TYPE_LABEL: Record<SocialPostType, string> = {
  image: "Single image",
  carousel: "Carousel",
  reel: "Reel / video",
};

/** Instagram's hard limits for API-published posts. */
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAG_MAX = 30;
export const IG_MENTION_MAX = 20;
export const FB_CAPTION_MAX = 63206;
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

/** Public storage bucket Meta fetches from: IG JPEG renders + uploaded videos. */
export const SOCIAL_BUCKET = "social-media";

/** Reclaim a 'publishing' row whose worker died after this long. */
export const STALE_CLAIM_MS = 10 * 60_000;
/** Give up (status 'failed') after this many publish attempts. */
export const MAX_ATTEMPTS = 6;

export function isSocialBrand(v: unknown): v is SocialBrand {
  return v === "Sassy" || v === "NI";
}
export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return v === "instagram" || v === "facebook";
}
export function isSocialPostType(v: unknown): v is SocialPostType {
  return v === "image" || v === "carousel" || v === "reel";
}

const VIDEO_EXT = /\.(mp4|mov|m4v)(\?|#|$)/i;

/** Guess image vs video from a URL (uploads keep their extension). */
export function mediaKindFromUrl(url: string): MediaKind {
  return VIDEO_EXT.test(url) ? "video" : "image";
}

export function countHashtags(caption: string): number {
  return (caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}
export function countMentions(caption: string): number {
  return (caption.match(/(^|\s)@[\w.]+/g) ?? []).length;
}

/** Clean an untrusted media array down to {url, kind} with https URLs. */
export function normalizeMedia(input: unknown): SocialMedia[] {
  if (!Array.isArray(input)) return [];
  const out: SocialMedia[] = [];
  for (const m of input) {
    const url = typeof m === "string" ? m : (m as { url?: unknown })?.url;
    if (typeof url !== "string" || !/^https:\/\//i.test(url.trim())) continue;
    const kindIn = typeof m === "object" ? (m as { kind?: unknown }).kind : undefined;
    const kind: MediaKind = kindIn === "video" || kindIn === "image" ? kindIn : mediaKindFromUrl(url);
    out.push({ url: url.trim(), kind });
  }
  return out.slice(0, CAROUSEL_MAX);
}

export type PostDraft = Pick<SocialPost, "brand" | "platforms" | "post_type" | "caption" | "media">;

/**
 * Problems that would stop this post from publishing. Empty = ready.
 * Drafts may be saved with problems; scheduling / publishing requires none.
 */
export function validatePost(p: PostDraft): string[] {
  const errs: string[] = [];
  const ig = p.platforms.includes("instagram");
  const fb = p.platforms.includes("facebook");

  if (!isSocialBrand(p.brand)) errs.push("Pick a brand.");
  if (p.platforms.length === 0) errs.push("Pick at least one platform.");

  const images = p.media.filter((m) => m.kind === "image");
  const videos = p.media.filter((m) => m.kind === "video");

  if (p.post_type === "image") {
    if (p.media.length !== 1 || images.length !== 1) errs.push("A single-image post needs exactly one image.");
  } else if (p.post_type === "carousel") {
    if (p.media.length < CAROUSEL_MIN || p.media.length > CAROUSEL_MAX) {
      errs.push(`A carousel needs ${CAROUSEL_MIN}–${CAROUSEL_MAX} images.`);
    }
    if (videos.length > 0) errs.push("Carousels are images only.");
  } else if (p.post_type === "reel") {
    if (p.media.length !== 1 || videos.length !== 1) errs.push("A reel needs exactly one video (.mp4 or .mov).");
  }

  if (ig) {
    if (p.caption.length > IG_CAPTION_MAX) errs.push(`Instagram captions max out at ${IG_CAPTION_MAX} characters.`);
    if (countHashtags(p.caption) > IG_HASHTAG_MAX) errs.push(`Instagram allows at most ${IG_HASHTAG_MAX} hashtags.`);
    if (countMentions(p.caption) > IG_MENTION_MAX) errs.push(`Instagram allows at most ${IG_MENTION_MAX} @mentions.`);
  }
  if (fb && p.caption.length > FB_CAPTION_MAX) errs.push("That caption is too long for Facebook.");

  return errs;
}

/** Roll per-platform results into the post's overall status. */
export function overallStatus(
  platforms: SocialPlatform[],
  results: Partial<Record<SocialPlatform, PlatformResult>>,
): "published" | "partial" | "failed" | "publishing" {
  const states = platforms.map((p) => results[p]?.status ?? "pending");
  if (states.some((s) => s === "pending")) return "publishing";
  const ok = states.filter((s) => s === "published").length;
  if (ok === platforms.length) return "published";
  return ok > 0 ? "partial" : "failed";
}
