import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * GET /api/email/images
 *
 * Lists the images already hosted in the public `email-assets` bucket so the
 * block editor's media library can offer them for re-use. Walks the bucket's
 * folders (block images, section backgrounds, per-template uploads) via the
 * service-role client — the base bucket isn't browsable with the anon key —
 * and returns each image's public URL, newest first.
 */

const BUCKET = "email-assets";
const MAX_IMAGES = 300;
const MAX_DEPTH = 3;

type Img = { path: string; url: string; size: number; updatedAt: string | null };

async function walk(prefix: string, depth: number, out: Img[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_IMAGES) return;
  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return;

  for (const item of data) {
    if (out.length >= MAX_IMAGES) break;
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    // Folders come back with a null id — recurse into them.
    if ((item as { id: string | null }).id === null) {
      await walk(path, depth + 1, out);
      continue;
    }
    const meta = (item.metadata ?? {}) as { size?: number; mimetype?: string };
    const isImage =
      (meta.mimetype ?? "").startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name);
    if (!isImage) continue;

    const { data: pub } = supabaseServer.storage.from(BUCKET).getPublicUrl(path);
    out.push({
      path,
      url: pub.publicUrl,
      size: meta.size ?? 0,
      updatedAt: (item.updated_at ?? item.created_at ?? null) as string | null,
    });
  }
}

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const out: Img[] = [];
  await walk("", 0, out);
  out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return NextResponse.json({ images: out.slice(0, MAX_IMAGES) });
}
