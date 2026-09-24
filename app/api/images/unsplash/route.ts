import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  getPhotographerProfiles,
  listPhotographerPhotos,
  trackUnsplashDownload,
  unsplashConfigured,
  unsplashPhotographers,
} from "@/lib/unsplash";

export const runtime = "nodejs";

/**
 * Unsplash photos from our photographers, for the image picker (lib/unsplash.ts).
 *
 *  GET  ?page=1&photographer=<username> — one page, newest first. Omit
 *       `photographer` for everyone in UNSPLASH_PHOTOGRAPHERS. Add `profiles=1`
 *       for each photographer's public profile + stats (the Photography page).
 *  POST { downloadLocation } — record a use with Unsplash (guideline-required).
 */

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const photographers = unsplashPhotographers();
  if (!unsplashConfigured() || photographers.length === 0) {
    return NextResponse.json({ configured: false, photographers, photos: [], hasMore: false });
  }

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const only = params.get("photographer");
  // Only the configured photographers are browsable, never an arbitrary account.
  const usernames = only ? photographers.filter((u) => u.toLowerCase() === only.toLowerCase()) : photographers;
  if (usernames.length === 0) return NextResponse.json({ error: "Unknown photographer" }, { status: 400 });

  try {
    const [{ photos, hasMore }, profiles] = await Promise.all([
      listPhotographerPhotos(page, usernames),
      params.get("profiles") ? getPhotographerProfiles(usernames) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ configured: true, photographers, photos, hasMore, profiles });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unsplash request failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { downloadLocation?: string } | null;
  if (!body?.downloadLocation) return NextResponse.json({ error: "Missing downloadLocation" }, { status: 400 });

  try {
    await trackUnsplashDownload(body.downloadLocation);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Tracking failed" }, { status: 400 });
  }
}
