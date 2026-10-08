import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { processDueSocialPosts } from "@/lib/social/publish";
import { metaConfigured } from "@/lib/social/meta";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Leave headroom under maxDuration to write results back. */
const WORK_BUDGET_MS = 250_000;

/**
 * GET /api/cron/social-publish
 *
 * Publishes every social_posts row whose scheduled_at has passed to
 * Facebook / Instagram, and resumes Instagram reels still processing.
 * Every 5 minutes in vercel.json. Claims are atomic, so overlapping runs
 * (cron + "Publish now") never double-post.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const isCronCall = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCronCall) {
    const user = await requireInternalUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!metaConfigured()) return NextResponse.json({ skipped: "META_ACCESS_TOKEN not set" });

  const result = await processDueSocialPosts(Date.now() + WORK_BUDGET_MS);
  return NextResponse.json(result);
}
