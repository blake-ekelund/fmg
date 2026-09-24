import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getSourceInfo, listPhotos, trackUnsplashDownload, unsplashConfigured, unsplashSources } from "@/lib/unsplash";

export const runtime = "nodejs";

/**
 * Unsplash photos from our brand collections + photographers (lib/unsplash.ts),
 * for the image pickers and Marketing → Photography.
 *
 *  GET  ?page=1&source=<key> — one page, newest first. Omit `source` for every
 *       source. Add `info=1` for each source's header-card details.
 *  POST { downloadLocation } — record a use with Unsplash (guideline-required).
 */

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const all = unsplashSources();
  const sources = all.map(({ key, label }) => ({ key, label }));
  if (!unsplashConfigured() || all.length === 0) {
    return NextResponse.json({ configured: false, sources, photos: [], hasMore: false, errors: [] });
  }

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const only = params.get("source");
  // Only configured sources are browsable, never an arbitrary account/collection.
  const selected = only ? all.filter((s) => s.key === only) : all;
  if (selected.length === 0) return NextResponse.json({ error: "Unknown source" }, { status: 400 });

  try {
    const [{ photos, hasMore, errors }, info] = await Promise.all([
      listPhotos(page, selected),
      params.get("info") ? getSourceInfo(selected) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ configured: true, sources, photos, hasMore, errors, info });
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
