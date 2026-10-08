import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { SOCIAL_BUCKET } from "@/lib/social/types";

export const runtime = "nodejs";

/**
 * POST /api/social/upload-url { filename } → { path, token, publicUrl }
 *
 * A signed upload URL into the public social-media bucket, so the browser
 * can send a reel video straight to storage (too big for an API body).
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { filename?: unknown };
  const raw = typeof body.filename === "string" ? body.filename : "video.mp4";
  const ext = raw.match(/\.(mp4|mov|m4v)$/i)?.[1]?.toLowerCase();
  if (!ext) return NextResponse.json({ error: "Upload an .mp4 or .mov video." }, { status: 400 });

  const safe = raw.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "video";
  const path = `videos/${Date.now()}-${safe}.${ext}`;

  const { data, error } = await supabaseServer.storage.from(SOCIAL_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    const hint = /not found/i.test(error?.message ?? "")
      ? "The social-media storage bucket is missing — run the social_posts migration."
      : error?.message ?? "Couldn't start the upload.";
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  const publicUrl = supabaseServer.storage.from(SOCIAL_BUCKET).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ path, token: data.token, publicUrl });
}
