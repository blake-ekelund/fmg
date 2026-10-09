import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { validatePost, type SocialPost } from "@/lib/social/types";
import { claimPost, publishClaimed } from "@/lib/social/publish";
import { designProblems, readPostFields } from "@/lib/social/server";
import { syncDesign } from "@/lib/social/designServer";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/social/posts/:id/publish { …fields? }
 *
 * "Publish now": saves any sent fields, queues the post for right now and
 * publishes it inline. A reel Instagram is still processing comes back as
 * 'publishing' and is finished by the cron.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await context.params;

  const { data: row } = await supabaseServer.from("social_posts").select("*").eq("id", id).maybeSingle();
  const post = row as SocialPost | null;
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (!["draft", "scheduled", "failed"].includes(post.status)) {
    return NextResponse.json({ error: "This post has already gone out." }, { status: 409 });
  }

  const fields = readPostFields((await request.json().catch(() => ({}))) as Record<string, unknown>);
  let next: SocialPost = { ...post, ...fields };
  if (next.design) {
    const problems = designProblems(next.design);
    if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 400 });
    try {
      Object.assign(fields, await syncDesign(next));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't render the slides." }, { status: 500 });
    }
    next = { ...next, ...fields };
  }
  const problems = validatePost(next);
  if (problems.length) return NextResponse.json({ error: problems.join(" "), problems }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await supabaseServer
    .from("social_posts")
    .update({ ...fields, status: "scheduled", scheduled_at: now, results: {}, attempts: 0, claimed_at: null, last_error: null, updated_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const claimed = await claimPost(id);
  if (!claimed) {
    // The cron grabbed it in the same instant — it will publish.
    const { data } = await supabaseServer.from("social_posts").select("*").eq("id", id).single();
    return NextResponse.json({ post: data as SocialPost });
  }
  const done = await publishClaimed(claimed, Date.now() + 240_000);
  return NextResponse.json({ post: done });
}
