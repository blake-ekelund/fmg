/**
 * Publishes social_posts rows to Facebook / Instagram.
 *
 * SERVER ONLY. Driven by /api/cron/social-publish (every 5 min) and the
 * "Publish now" route. Each due row is claimed atomically (status →
 * 'publishing', claimed_at = now) so overlapping runs never double-post, then
 * each platform is published and its result written back immediately — a
 * platform already 'published' in `results` is skipped on any retry.
 *
 * Instagram reels can take minutes to process. If a container isn't ready by
 * the deadline, its id is saved in results.instagram.container_id, the claim
 * is released, and the next tick resumes from that container.
 */

import sharp from "sharp";
import { syncDesign } from "./designServer";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  MAX_ATTEMPTS,
  SOCIAL_BUCKET,
  STALE_CLAIM_MS,
  overallStatus,
  validatePost,
  type PlatformResult,
  type SocialPlatform,
  type SocialPost,
} from "./types";
import {
  MetaError,
  brandAccount,
  fbPublishAlbum,
  fbPublishPhoto,
  fbPublishVideo,
  igCreateCarousel,
  igCreateImage,
  igCreateReel,
  igPublish,
  igWaitReady,
  type BrandAccount,
  type Published,
} from "./meta";

/* ─── Instagram image prep ─────────────────────────────────────────── */

/** Instagram feed limits: 4:5 portrait … 1.91:1 landscape, JPEG, ≤1440px wide. */
const IG_MIN_RATIO = 4 / 5;
const IG_MAX_RATIO = 1.91;
const IG_MAX_WIDTH = 1440;

export function clampIgRatio(ratio: number): number {
  return Math.min(IG_MAX_RATIO, Math.max(IG_MIN_RATIO, ratio));
}

/**
 * Make an image Instagram-safe: JPEG, ≤1440px wide, padded (never cropped —
 * product shots and text slides must stay whole) to `targetRatio` with white.
 * Returns the public URL of the render, or the original if it already fits.
 */
async function prepIgImage(url: string, postId: string, index: number, targetRatio?: number): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new MetaError(`Couldn't download image ${index + 1} (${res.status}).`);
  const input = Buffer.from(await res.arrayBuffer());

  const img = sharp(input, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  // .rotate() honors EXIF orientation; 5–8 swap the axes.
  const swap = (meta.orientation ?? 1) >= 5;
  const w = (swap ? meta.height : meta.width) ?? 0;
  const h = (swap ? meta.width : meta.height) ?? 0;
  if (!w || !h) throw new MetaError(`Image ${index + 1} isn't a readable image.`);

  const ratio = w / h;
  const want = targetRatio ?? clampIgRatio(ratio);
  const isJpeg = meta.format === "jpeg";
  if (isJpeg && Math.abs(ratio - want) < 0.01 && w <= IG_MAX_WIDTH && input.length < 8 * 1024 * 1024) {
    return url;
  }

  // Canvas at the target ratio that contains the whole image.
  let cw = w;
  let ch = h;
  if (ratio > want) ch = Math.round(w / want);
  else cw = Math.round(h * want);
  const scale = Math.min(1, IG_MAX_WIDTH / cw);
  const fw = Math.max(1, Math.round(w * scale));
  const fh = Math.max(1, Math.round(h * scale));
  const fcw = Math.max(fw, Math.round(cw * scale));
  const fch = Math.max(fh, Math.round(ch * scale));
  const left = Math.floor((fcw - fw) / 2);
  const top = Math.floor((fch - fh) / 2);

  const out = await img
    .resize(fw, fh)
    .flatten({ background: "#ffffff" })
    .extend({ left, right: fcw - fw - left, top, bottom: fch - fh - top, background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const path = `renders/${postId}/${index}-${Date.now()}.jpg`;
  const { error } = await supabaseServer.storage
    .from(SOCIAL_BUCKET)
    .upload(path, out, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
  if (error) throw new MetaError(`Couldn't store the Instagram version of image ${index + 1}: ${error.message}`);
  return supabaseServer.storage.from(SOCIAL_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function imageRatio(url: string): Promise<number> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new MetaError(`Couldn't download the first image (${res.status}).`);
  const meta = await sharp(Buffer.from(await res.arrayBuffer()), { failOn: "none" }).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const w = (swap ? meta.height : meta.width) ?? 1;
  const h = (swap ? meta.width : meta.height) ?? 1;
  return w / h;
}

/* ─── Per-platform publishing ──────────────────────────────────────── */

type IgOutcome = { done: true; published: Published } | { done: false; containerId: string };

async function publishInstagram(
  post: SocialPost,
  acct: BrandAccount,
  prior: PlatformResult | undefined,
  deadline: number,
): Promise<IgOutcome> {
  let containerId = prior?.container_id;

  if (!containerId) {
    if (post.post_type === "image") {
      const url = await prepIgImage(post.media[0].url, post.id, 0);
      containerId = await igCreateImage(acct, url, post.caption);
    } else if (post.post_type === "carousel") {
      // Instagram shows every slide at the first slide's ratio — pad them all to it.
      const ratio = clampIgRatio(await imageRatio(post.media[0].url));
      const children: string[] = [];
      for (let i = 0; i < post.media.length; i++) {
        const url = await prepIgImage(post.media[i].url, post.id, i, ratio);
        children.push(await igCreateImage(acct, url, null, true));
      }
      for (const c of children) {
        if (!(await igWaitReady(acct, c, deadline))) {
          throw new MetaError("Instagram is still processing the carousel images — will retry.", { transient: true });
        }
      }
      containerId = await igCreateCarousel(acct, children, post.caption);
    } else {
      containerId = await igCreateReel(acct, post.media[0].url, post.caption);
    }
  }

  if (!(await igWaitReady(acct, containerId, deadline))) return { done: false, containerId };
  return { done: true, published: await igPublish(acct, containerId) };
}

async function publishFacebook(post: SocialPost, acct: BrandAccount): Promise<Published> {
  if (post.post_type === "image") return fbPublishPhoto(acct, post.media[0].url, post.caption);
  if (post.post_type === "carousel") return fbPublishAlbum(acct, post.media.map((m) => m.url), post.caption);
  return fbPublishVideo(acct, post.media[0].url, post.caption);
}

/* ─── Claiming + one post ──────────────────────────────────────────── */

async function saveResults(id: string, patch: Partial<SocialPost>) {
  const { error } = await supabaseServer
    .from("social_posts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error(`[social] save ${id} failed:`, error.message);
}

/** Atomically take a due post. Returns the row if this worker now owns it. */
export async function claimPost(id: string): Promise<SocialPost | null> {
  const now = new Date();
  const stale = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await supabaseServer
    .from("social_posts")
    .update({ status: "publishing", claimed_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", id)
    .lte("scheduled_at", now.toISOString())
    .or(`status.eq.scheduled,and(status.eq.publishing,claimed_at.is.null),and(status.eq.publishing,claimed_at.lt.${stale})`)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SocialPost | null) ?? null;
}

/**
 * Publish a claimed post to each of its platforms not yet published. Writes
 * results as it goes. Returns the final row state.
 */
export async function publishClaimed(claimed: SocialPost, deadline: number): Promise<SocialPost> {
  let post = claimed;
  const attempts = post.attempts + 1;
  const results: Partial<Record<SocialPlatform, PlatformResult>> = { ...post.results };

  // A designed post edited after scheduling: redraw stale slides before posting.
  // Only before anything has gone out — a partly-published post keeps its media.
  if (post.design && !Object.values(results).some((r) => r?.status === "published")) {
    try {
      const synced = await syncDesign(post);
      if (synced.media) await saveResults(post.id, synced);
      post = { ...post, ...synced };
    } catch (e) {
      const final = { status: "failed" as const, attempts, claimed_at: null, last_error: `Couldn't render the slides: ${e instanceof Error ? e.message : String(e)}` };
      await saveResults(post.id, final);
      return { ...post, ...final };
    }
  }

  const problems = validatePost(post);
  if (problems.length) {
    const final = { status: "failed" as const, attempts, claimed_at: null, last_error: problems.join(" ") };
    await saveResults(post.id, final);
    return { ...post, ...final };
  }

  let acct: BrandAccount | null = null;
  let acctError: MetaError | null = null;
  try {
    acct = await brandAccount(post.brand);
  } catch (e) {
    acctError = e instanceof MetaError ? e : new MetaError(String(e));
  }

  let waiting = false;
  let retryable = false;

  for (const platform of post.platforms) {
    if (results[platform]?.status === "published") continue;
    const at = new Date().toISOString();
    try {
      if (!acct) throw acctError!;
      if (platform === "instagram") {
        const out = await publishInstagram(post, acct, results.instagram, deadline);
        if (out.done) {
          results.instagram = { status: "published", id: out.published.id, permalink: out.published.permalink ?? undefined, at };
        } else {
          results.instagram = { status: "pending", container_id: out.containerId, at };
          waiting = true;
        }
      } else {
        const out = await publishFacebook(post, acct);
        results.facebook = { status: "published", id: out.id, permalink: out.permalink ?? undefined, at };
      }
    } catch (e) {
      const err = e instanceof MetaError ? e : new MetaError(e instanceof Error ? e.message : String(e));
      // A transient failure keeps the platform pending for the next tick (until MAX_ATTEMPTS).
      if (err.transient && attempts < MAX_ATTEMPTS) {
        results[platform] = { status: "pending", error: err.message, at };
        retryable = true;
      } else {
        results[platform] = { status: "failed", error: err.message, at };
      }
      console.error(`[social] ${post.id} ${platform}:`, err.message);
    }
    // Record each platform as soon as it's known — a crash later must not repost it.
    await saveResults(post.id, { results, attempts });
  }

  const errors = post.platforms
    .map((p) => (results[p]?.error ? `${p === "instagram" ? "Instagram" : "Facebook"}: ${results[p]!.error}` : null))
    .filter(Boolean)
    .join(" · ");

  let status = overallStatus(post.platforms, results);
  if (status === "publishing" && !waiting && !retryable) status = "failed";
  if (status === "publishing" && attempts >= MAX_ATTEMPTS) {
    for (const p of post.platforms) {
      if (results[p]?.status === "pending") {
        results[p] = { ...results[p]!, status: "failed", error: results[p]!.error ?? "Timed out waiting for Instagram." };
      }
    }
    status = overallStatus(post.platforms, results);
  }

  const final: Partial<SocialPost> = {
    status,
    results,
    attempts,
    claimed_at: null, // release: a 'publishing' row with no claim is resumed next tick
    last_error: errors || null,
    published_at: status === "published" || status === "partial" ? new Date().toISOString() : post.published_at,
  };
  await saveResults(post.id, final);
  return { ...post, ...final } as SocialPost;
}

/* ─── Cron entry ───────────────────────────────────────────────────── */

export type PublishRunResult = { claimed: number; published: number; failed: number; waiting: number; ids: string[] };

/** Publish every due post until `deadline` (epoch ms). */
export async function processDueSocialPosts(deadline: number): Promise<PublishRunResult> {
  const out: PublishRunResult = { claimed: 0, published: 0, failed: 0, waiting: 0, ids: [] };
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("id")
    .in("status", ["scheduled", "publishing"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(25);
  if (error) {
    if (/relation .*social_posts.* does not exist/i.test(error.message)) return out; // migration not applied yet
    throw new Error(error.message);
  }

  for (const { id } of (data ?? []) as { id: string }[]) {
    if (Date.now() > deadline - 30_000) break;
    const post = await claimPost(id);
    if (!post) continue;
    out.claimed++;
    out.ids.push(id);
    const done = await publishClaimed(post, deadline - 20_000);
    if (done.status === "published" || done.status === "partial") out.published++;
    else if (done.status === "failed") out.failed++;
    else out.waiting++;
  }
  return out;
}
