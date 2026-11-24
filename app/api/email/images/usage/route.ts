import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { imageUsage, parseLibraryKey } from "@/lib/images/usage";

export const runtime = "nodejs";

/**
 * GET /api/email/images/usage?path=<library key>
 *
 * Where one Image Library image is used: the products and fragrances it's
 * linked to, and the website pages, saved sections, blog posts and email
 * templates whose content holds its URL (see lib/images/usage.ts). The Image
 * Library shows this beside the image and before a delete. Internal staff only.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("path")?.trim();
  if (!key || key.startsWith("unsplash:") || key.includes("..")) {
    return NextResponse.json({ error: "Missing image path" }, { status: 400 });
  }
  try {
    const { bucket, path } = parseLibraryKey(key);
    return NextResponse.json({ usage: await imageUsage(bucket, path) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't check where this image is used." }, { status: 500 });
  }
}
