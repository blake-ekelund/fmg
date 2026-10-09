import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { isSocialBrand, type InstagramFeed } from "@/lib/social/types";
import { brandAccount, igProfile, igRecentMedia, metaConfigured } from "@/lib/social/meta";

export const runtime = "nodejs";

/**
 * GET /api/social/feed?brand=NI — the brand's live Instagram profile and its
 * latest posts, for the "Preview feed" grid on /marketing/social (which lays
 * our scheduled posts on top). Never fails hard: a Meta problem comes back as
 * `error` so the preview can still show the scheduled posts.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const brand = new URL(request.url).searchParams.get("brand");
  if (!isSocialBrand(brand)) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });

  if (!metaConfigured()) {
    return NextResponse.json({ profile: null, items: [], error: "Meta isn't connected, so live posts can't be loaded." } satisfies InstagramFeed);
  }
  try {
    const acct = await brandAccount(brand);
    const [profile, items] = await Promise.all([igProfile(acct), igRecentMedia(acct)]);
    return NextResponse.json({ profile, items, error: null } satisfies InstagramFeed);
  } catch (e) {
    return NextResponse.json({ profile: null, items: [], error: e instanceof Error ? e.message : String(e) } satisfies InstagramFeed);
  }
}
