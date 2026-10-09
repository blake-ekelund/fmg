import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { validatePost, type PlatformResult, type SocialPlatform, type SocialPost } from "@/lib/social/types";
import {
  DESIGN_MIGRATION_HINT,
  designColumnMissing,
  designFields,
  designProblems,
  readPostFields,
} from "@/lib/social/server";
import { syncDesign } from "@/lib/social/designServer";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * One social post.
 *
 *   GET    — the row.
 *   PATCH  { …fields, action?: "draft" | "schedule" | "retry", render?: boolean }
 *            fields   save title / brand / platforms / post_type / caption / media /
 *                     design / scheduled_at. Only while the post is a draft,
 *                     scheduled or failed — once anything has gone out
 *                     (publishing / published / partial) the content is locked.
 *                     A designed post's caption + type are compiled from its
 *                     design here; `render: true` also redraws stale slides.
 *            draft    unschedule (back to draft).
 *            schedule render (designed posts), then queue for scheduled_at;
 *                     the post must validate and the time must be set. A past
 *                     time publishes on the next cron tick.
 *            retry    failed / partial → re-queue now for the platforms that
 *                     failed; platforms already published are never reposted.
 *   DELETE — removes the row. Posts already on Facebook / Instagram stay there.
 */

const EDITABLE = new Set(["draft", "scheduled", "failed"]);

async function load(id: string): Promise<SocialPost | null> {
  const { data } = await supabaseServer.from("social_posts").select("*").eq("id", id).maybeSingle();
  return (data as SocialPost | null) ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await context.params;
  const post = await load(id);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await context.params;

  const post = await load(id);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  const fields = readPostFields(body);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === "retry") {
    if (post.status !== "failed" && post.status !== "partial") {
      return NextResponse.json({ error: "Only failed posts can be retried." }, { status: 409 });
    }
    // Drop failed platform results so they are attempted again; keep published ones.
    const results: Partial<Record<SocialPlatform, PlatformResult>> = {};
    for (const p of post.platforms) if (post.results[p]?.status === "published") results[p] = post.results[p];
    Object.assign(patch, {
      status: "scheduled",
      scheduled_at: new Date().toISOString(),
      results,
      attempts: 0,
      claimed_at: null,
      last_error: null,
    });
  } else {
    const hasFields = Object.keys(fields).length > 0;
    if (hasFields && !EDITABLE.has(post.status)) {
      return NextResponse.json(
        { error: "This post has already gone out (at least in part) — it can't be edited." },
        { status: 409 },
      );
    }
    let next: SocialPost = { ...post, ...fields };
    if (next.design) Object.assign(fields, designFields(next.design));
    Object.assign(patch, fields);
    next = { ...next, ...fields };

    if (action === "draft") {
      if (!EDITABLE.has(post.status)) return NextResponse.json({ error: "This post can't go back to draft." }, { status: 409 });
      patch.status = "draft";
    } else if (action === "schedule") {
      if (!EDITABLE.has(post.status)) return NextResponse.json({ error: "This post is already publishing." }, { status: 409 });
      const problems = next.design ? designProblems(next.design) : [];
      if (!problems.length && next.design) {
        try {
          const synced = await syncDesign(next);
          Object.assign(patch, synced);
          next = { ...next, ...synced };
        } catch (e) {
          return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't render the slides." }, { status: 500 });
        }
      }
      problems.push(...validatePost(next));
      if (!next.scheduled_at) problems.push("Pick a date and time.");
      if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 400 });
      Object.assign(patch, { status: "scheduled", results: {}, attempts: 0, claimed_at: null, last_error: null });
    } else {
      if (body.render === true && next.design && EDITABLE.has(post.status)) {
        try {
          const synced = await syncDesign(next);
          Object.assign(patch, synced);
        } catch (e) {
          return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't render the slides." }, { status: 500 });
        }
      }
      // Editing a failed post turns it back into a draft to fix and re-schedule.
      if (post.status === "failed" && hasFields) {
        Object.assign(patch, { status: "draft", results: {}, attempts: 0, last_error: null });
      }
    }
  }

  const { data, error } = await supabaseServer.from("social_posts").update(patch).eq("id", id).select("*").single();
  if (error) {
    if (designColumnMissing(error.message)) return NextResponse.json({ error: DESIGN_MIGRATION_HINT }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ post: data as SocialPost });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await context.params;

  const post = await load(id);
  if (!post) return NextResponse.json({ ok: true });
  if (post.status === "publishing") {
    return NextResponse.json({ error: "This post is publishing right now — try again in a minute." }, { status: 409 });
  }
  const { error } = await supabaseServer.from("social_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
