import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * Images hosted in the public `email-assets` bucket, plus their editorial
 * metadata (title / alt / description / sharing) from `email_asset_meta`.
 *
 *  GET    — list every image, newest first, merged with its metadata row.
 *  PATCH  — upsert metadata for one image (by storage path).
 *  DELETE — remove one image: its storage object AND its metadata row.
 *
 * The bucket is the source of truth for which images exist; the metadata table
 * is an optional sidecar keyed by path. All three run with the service-role
 * client (the base bucket isn't browsable with the anon key) and are gated to
 * internal staff.
 */

const BUCKET = "email-assets";
const MAX_IMAGES = 300;
const MAX_DEPTH = 3;

type ShareScope = "internal" | "third_party";

type Img = {
  path: string;
  url: string;
  size: number;
  updatedAt: string | null;
  title: string | null;
  altText: string | null;
  description: string | null;
  shareScope: ShareScope;
};

type MetaRow = {
  path: string;
  title: string | null;
  alt_text: string | null;
  description: string | null;
  share_scope: ShareScope;
};

async function walk(prefix: string, depth: number, out: Omit<Img, "title" | "altText" | "description" | "shareScope">[]): Promise<void> {
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

  const files: Omit<Img, "title" | "altText" | "description" | "shareScope">[] = [];
  await walk("", 0, files);
  files.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  // Merge in editorial metadata by path (rows are optional).
  const { data: metaData } = await supabaseServer
    .from("email_asset_meta")
    .select("path, title, alt_text, description, share_scope");
  const byPath = new Map((metaData ?? []).map((m) => [(m as MetaRow).path, m as MetaRow]));

  const images: Img[] = files.slice(0, MAX_IMAGES).map((f) => {
    const m = byPath.get(f.path);
    return {
      ...f,
      title: m?.title ?? null,
      altText: m?.alt_text ?? null,
      description: m?.description ?? null,
      shareScope: (m?.share_scope as ShareScope) ?? "internal",
    };
  });

  return NextResponse.json({ images });
}

export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { path?: string; title?: string; altText?: string; description?: string; shareScope?: string }
    | null;
  const path = body?.path?.trim();
  if (!path) return NextResponse.json({ error: "Missing image path" }, { status: 400 });

  if (body?.shareScope != null && body.shareScope !== "internal" && body.shareScope !== "third_party") {
    return NextResponse.json({ error: "Invalid shareScope" }, { status: 400 });
  }

  // Only overwrite the fields that were provided; empty strings clear a field.
  const norm = (v: string | undefined) => (v == null ? undefined : v.trim() === "" ? null : v.trim());
  const patch: Record<string, unknown> = {
    path,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (body?.title !== undefined) patch.title = norm(body.title);
  if (body?.altText !== undefined) patch.alt_text = norm(body.altText);
  if (body?.description !== undefined) patch.description = norm(body.description);
  if (body?.shareScope !== undefined) patch.share_scope = body.shareScope;

  const { error } = await supabaseServer
    .from("email_asset_meta")
    .upsert(patch, { onConflict: "path" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { path?: string } | null;
  const path = body?.path?.trim();
  if (!path) return NextResponse.json({ error: "Missing image path" }, { status: 400 });

  const { error: rmErr } = await supabaseServer.storage.from(BUCKET).remove([path]);
  if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });

  // Object gone — drop the sidecar row too (ignore its error; the image is what matters).
  await supabaseServer.from("email_asset_meta").delete().eq("path", path);

  return NextResponse.json({ ok: true });
}
