import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * Images hosted in the public `email-assets` bucket, plus their editorial
 * metadata (title / alt / description / sharing / folder) from `email_asset_meta`.
 *
 *  GET    — list every image, newest first, merged with its metadata row, plus
 *           every folder (including empty ones).
 *  POST   — create a named top-level folder.
 *  PATCH  — upsert metadata for one image (by storage path), or re-file many
 *           images at once (`{ paths, folder }`).
 *  DELETE — remove one image (storage object AND metadata row), or an empty folder.
 *
 * Folders. An image's folder is its `email_asset_meta.folder` label when set,
 * else the top-level storage prefix it was uploaded under. Re-filing only ever
 * changes the label — never the storage path — because the path IS the public
 * URL that emails and blog posts embed, so a real move would break them.
 * New folders are storage prefixes held open by a placeholder object (the
 * `.emptyFolderPlaceholder` convention the Supabase dashboard uses) so they can
 * be uploaded into and exist while empty; names are slugged because uploads put
 * the name into the URL. The folder list = placeholder-held prefixes ∪ every
 * image's effective folder, so a prefix whose images were all re-filed away
 * (and whose placeholder is gone) drops out of the list.
 *
 * The bucket is the source of truth for which images exist; the metadata table
 * is an optional sidecar keyed by path. Everything runs with the service-role
 * client (the base bucket isn't browsable with the anon key) and is gated to
 * internal staff.
 */

const BUCKET = "email-assets";
const MAX_IMAGES = 300;
const MAX_DEPTH = 3;
const PLACEHOLDER = ".emptyFolderPlaceholder";
/** Images sitting at the bucket root have no prefix; they read as this folder. */
const ROOT = "root";

/** "Sassy Holiday 2026" → "sassy-holiday-2026". Empty string if nothing usable. */
function slugFolder(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The top-level storage prefix of a path (where it was uploaded). */
function prefixOf(path: string): string {
  return path.includes("/") ? path.split("/")[0] : ROOT;
}

function validFolderName(f: string): boolean {
  return !!f && !f.includes("/") && f !== "." && f !== ".." && f !== ROOT && f !== PLACEHOLDER;
}

/** Store a label only when it differs from where the image physically lives. */
function labelFor(path: string, folder: string | null): string | null {
  return folder == null || folder === prefixOf(path) ? null : folder;
}

type ShareScope = "internal" | "third_party";

type FileEntry = { path: string; url: string; size: number; updatedAt: string | null };

type Img = FileEntry & {
  title: string | null;
  altText: string | null;
  description: string | null;
  shareScope: ShareScope;
  folder: string;
};

type MetaRow = {
  path: string;
  title: string | null;
  alt_text: string | null;
  description: string | null;
  share_scope: ShareScope;
  folder?: string | null;
};

async function walk(
  prefix: string,
  depth: number,
  out: FileEntry[],
  heldFolders: Set<string>,
): Promise<void> {
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
      await walk(path, depth + 1, out, heldFolders);
      continue;
    }
    if (depth === 1 && item.name === PLACEHOLDER) {
      heldFolders.add(prefix);
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

/** Metadata rows; tolerates the `folder` column not being migrated yet. */
async function loadMeta(): Promise<MetaRow[]> {
  const withFolder = await supabaseServer
    .from("email_asset_meta")
    .select("path, title, alt_text, description, share_scope, folder");
  if (!withFolder.error) return (withFolder.data ?? []) as MetaRow[];
  const without = await supabaseServer
    .from("email_asset_meta")
    .select("path, title, alt_text, description, share_scope");
  return (without.data ?? []) as MetaRow[];
}

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const files: FileEntry[] = [];
  const folders = new Set<string>();
  await walk("", 0, files, folders);
  files.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  // Merge in editorial metadata by path (rows are optional).
  const byPath = new Map((await loadMeta()).map((m) => [m.path, m]));

  const images: Img[] = files.slice(0, MAX_IMAGES).map((f) => {
    const m = byPath.get(f.path);
    const folder = m?.folder || prefixOf(f.path);
    folders.add(folder);
    return {
      ...f,
      title: m?.title ?? null,
      altText: m?.alt_text ?? null,
      description: m?.description ?? null,
      shareScope: (m?.share_scope as ShareScope) ?? "internal",
      folder,
    };
  });

  return NextResponse.json({ images, folders: Array.from(folders).sort() });
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const folder = slugFolder(body?.name ?? "");
  if (!validFolderName(folder)) {
    return NextResponse.json({ error: "Give the folder a name (letters or numbers)." }, { status: 400 });
  }

  // Idempotent: creating a folder that already exists just (re)opens it.
  const { error } = await supabaseServer.storage
    .from(BUCKET)
    .upload(`${folder}/${PLACEHOLDER}`, new Blob([""], { type: "text/plain" }), { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ folder });
}

export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        path?: string;
        paths?: string[];
        title?: string;
        altText?: string;
        description?: string;
        shareScope?: string;
        folder?: string | null;
      }
    | null;

  if (body?.folder != null && !validFolderName(body.folder)) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const stamp = { updated_by: user.id, updated_at: new Date().toISOString() };

  // Bulk re-file: only the folder label changes; other metadata is untouched
  // (upsert only writes the columns present in each row).
  if (Array.isArray(body?.paths)) {
    if (body.folder === undefined) return NextResponse.json({ error: "Missing folder" }, { status: 400 });
    const paths = body.paths.map((p) => String(p).trim()).filter(Boolean);
    if (paths.length === 0) return NextResponse.json({ error: "No images selected" }, { status: 400 });
    if (paths.length > MAX_IMAGES) return NextResponse.json({ error: "Too many images" }, { status: 400 });
    const rows = paths.map((p) => ({ path: p, folder: labelFor(p, body.folder ?? null), ...stamp }));
    const { error } = await supabaseServer.from("email_asset_meta").upsert(rows, { onConflict: "path" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const path = body?.path?.trim();
  if (!path) return NextResponse.json({ error: "Missing image path" }, { status: 400 });

  if (body?.shareScope != null && body.shareScope !== "internal" && body.shareScope !== "third_party") {
    return NextResponse.json({ error: "Invalid shareScope" }, { status: 400 });
  }

  // Only overwrite the fields that were provided; empty strings clear a field.
  const norm = (v: string | undefined) => (v == null ? undefined : v.trim() === "" ? null : v.trim());
  const patch: Record<string, unknown> = { path, ...stamp };
  if (body?.title !== undefined) patch.title = norm(body.title);
  if (body?.altText !== undefined) patch.alt_text = norm(body.altText);
  if (body?.description !== undefined) patch.description = norm(body.description);
  if (body?.shareScope !== undefined) patch.share_scope = body.shareScope;
  if (body?.folder !== undefined) patch.folder = labelFor(path, body.folder);

  const { error } = await supabaseServer
    .from("email_asset_meta")
    .upsert(patch, { onConflict: "path" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { path?: string; folder?: string } | null;

  // Folder delete — only when nothing is filed in it. It only ever removes the
  // placeholder; images physically under the prefix but re-filed elsewhere stay.
  if (body?.folder !== undefined) {
    const folder = body.folder.trim();
    if (!validFolderName(folder)) return NextResponse.json({ error: "Invalid folder" }, { status: 400 });

    const meta = await loadMeta();
    const labelOf = new Map(meta.map((m) => [m.path, m.folder ?? null]));
    if (meta.some((m) => m.folder === folder)) {
      return NextResponse.json({ error: "Only empty folders can be deleted." }, { status: 409 });
    }
    const { data: contents, error: listErr } = await supabaseServer.storage
      .from(BUCKET)
      .list(folder, { limit: 1000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const stillHere = (contents ?? []).some((i) => {
      if (i.name === PLACEHOLDER) return false;
      if ((i as { id: string | null }).id === null) return true; // subfolder — leave it alone
      return !labelOf.get(`${folder}/${i.name}`); // not re-filed elsewhere
    });
    if (stillHere) return NextResponse.json({ error: "Only empty folders can be deleted." }, { status: 409 });

    const { error: rmErr } = await supabaseServer.storage.from(BUCKET).remove([`${folder}/${PLACEHOLDER}`]);
    if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const path = body?.path?.trim();
  if (!path) return NextResponse.json({ error: "Missing image path" }, { status: 400 });

  const { error: rmErr } = await supabaseServer.storage.from(BUCKET).remove([path]);
  if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });

  // Object gone — drop the sidecar row too (ignore its error; the image is what matters).
  await supabaseServer.from("email_asset_meta").delete().eq("path", path);

  return NextResponse.json({ ok: true });
}
