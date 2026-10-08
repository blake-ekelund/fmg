import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { validatePost, type PlatformResult, type SocialPlatform, type SocialPost } from "@/lib/social/types";
import { readPostFields } from "@/lib/social/server";

export const runtime = "nodejs";

/**
 * One social post.
 *
 *   PATCH  { …fields, action?: "draft" | "schedule" | "retry" }
 *            fields   save brand / platforms / post_type / caption / media / scheduled_at.
 *                     Only while the post is a draft, scheduled or failed — once
 *                     anything has gone out (publishing / published / partial)
 *                     the content is locked.
 *            draft    unschedule (back to draft).
 *            schedule queue for scheduled_at; the post must validate and the
 *                     time must be set. A past time publishes on the next cron tick.
 *            retry    failed / partial → re-queue now for the platforms that
 *                     failed; platforms already published are never reposted.
 *   DELETE — removes the row. Posts already on Facebook / Instagram stay there.
 */

const EDITABLE = new Set(["draft", "scheduled", "failed"]);

async function load(id: string): Promise<SocialPost | null> {
  const { data } = await supabaseServer.from("social_posts").select("*").eq("id", id).maybeSingle();
  return (data as SocialPost | null) ?? null;
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
    Object.assign(patch, fields);
    const next = { ...post, ...fields };

    if (action === "draft") {
      if (!EDITABLE.has(post.status)) return NextResponse.json({ error: "This post can't go back to draft." }, { status: 409 });
      patch.status = "draft";
    } else if (action === "schedule") {
      if (!EDITABLE.has(post.status)) return NextResponse.json({ error: "This post is already publishing." }, { status: 409 });
      const problems = validatePost(next);
      if (!next.scheduled_at) problems.push("Pick a date and time.");
      if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 400 });
      Object.assign(patch, { status: "scheduled", results: {}, attempts: 0, claimed_at: null, last_error: null });
    } else if (post.status === "failed" && hasFields) {
      // Editing a failed post turns it back into a draft to fix and re-schedule.
      Object.assign(patch, { status: "draft", results: {}, attempts: 0, last_error: null });
    }
  }

  const { data, error } = await supabaseServer.from("social_posts").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
