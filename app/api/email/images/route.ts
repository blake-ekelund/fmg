import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * The Image Library: images in the public `email-assets` bucket with their
 * editorial metadata (title / alt / description / sharing / folder) from
 * `email_asset_meta`, plus every product photo from the Media Kit shown in
 * read-only per-brand folders.
 *
 *  GET    — every image (library + product), newest first, and every folder.
 *  POST   — create a folder, optionally inside another (`{ name, parent }`).
 *  PATCH  — upsert metadata for one image (by storage path), or re-file many
 *           images at once (`{ paths, folder }`).
 *  DELETE — remove one image (storage object AND metadata row), or an empty folder.
 *
 * Folders are paths, up to MAX_FOLDER_DEPTH segments ("sassy-holiday/ads").
 * An image's folder is its `email_asset_meta.folder` label when set, else the
 * storage directory it was uploaded into. Re-filing only ever changes the label
 * — never the storage path — because the path IS the public URL that emails and
 * blog posts embed, so a real move would break them. New folders are storage
 * prefixes held open by a placeholder object (the `.emptyFolderPlaceholder`
 * convention the Supabase dashboard uses) so they can be uploaded into and exist
 * while empty; names are slugged because uploads put them into the URL. The
 * folder list = placeholder-held prefixes ∪ every image's effective folder (and
 * their ancestors), so a prefix whose images were all re-filed away (and whose
 * placeholder is gone) drops out.
 *
 * Product photos (`media_kit_assets`, public `media-kit` bucket) are grouped
 * "<Brand> Products" → one subfolder per product. They're managed on the
 * product page, so here they're read-only: no re-filing, metadata, or delete.
 * Their folder ids start with "~", which no slugged library folder can.
 *
 * The bucket is the source of truth for which library images exist; the
 * metadata table is an optional sidecar keyed by path. Everything runs with the
 * service-role client and is gated to internal staff.
 */

const BUCKET = "email-assets";
const PRODUCT_BUCKET = "media-kit";
const MAX_IMAGES = 300;
const MAX_PRODUCT_IMAGES = 3000;
const PAGE = 1000;
const MAX_DEPTH = 3;
const MAX_FOLDER_DEPTH = 3;
const PLACEHOLDER = ".emptyFolderPlaceholder";
/** Images sitting at the bucket root have no directory; they read as this folder. */
const ROOT = "root";
const PRODUCT_PREFIX = "~products";

const BRAND_NAMES: Record<string, string> = {
  Sassy: "Sassy Products",
  NI: "Natural Inspirations Products",
};

/** "Sassy Holiday 2026" → "sassy-holiday-2026". Empty string if nothing usable. */
function slugFolder(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The storage directory of a path (where it was uploaded). */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? ROOT : path.slice(0, i);
}

function parentOf(folder: string): string | null {
  const i = folder.lastIndexOf("/");
  return i === -1 ? null : folder.slice(0, i);
}

/** A library folder path a user may create / file into. */
function validFolder(f: string): boolean {
  if (!f || f.startsWith("~") || f === ROOT) return false;
  const segs = f.split("/");
  if (segs.length > MAX_FOLDER_DEPTH) return false;
  return segs.every((s) => !!s && s !== "." && s !== ".." && s !== PLACEHOLDER && !s.includes("~"));
}

/** Store a label only when it differs from where the image physically lives. */
function labelFor(path: string, folder: string | null): string | null {
  return folder == null || folder === dirOf(path) ? null : folder;
}

/**
 * Folder name for a product: "Bath + Shower Gel · Grapefruit". Drops the
 * " l Sassy + Co" brand tail and adds the fragrance — many products share a
 * display name and differ only by scent.
 */
function productFolderName(displayName: string | null, fragrance: string | null, part: string): string {
  const base = (displayName ?? "").replace(/\s+[l|]\s+Sassy \+ Co\s*$/i, "").trim() || part;
  const scent = fragrance?.trim();
  return scent && !base.toLowerCase().includes(scent.toLowerCase()) ? `${base} · ${scent}` : base;
}

/** "sassy-holiday-2026" → "Sassy Holiday 2026". */
function prettySegment(seg: string): string {
  return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ShareScope = "internal" | "third_party";

type FileEntry = { path: string; url: string; size: number; updatedAt: string | null };

type Img = FileEntry & {
  title: string | null;
  altText: string | null;
  description: string | null;
  shareScope: ShareScope;
  folder: string;
  source: "library" | "product";
  productPart?: string;
};

type Folder = { id: string; name: string; readOnly: boolean };

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
    if (prefix && item.name === PLACEHOLDER) {
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

/** Library images with metadata merged in, plus the set of library folders. */
async function librarySnapshot(): Promise<{ images: Img[]; folders: Set<string>; meta: MetaRow[] }> {
  const files: FileEntry[] = [];
  const folders = new Set<string>();
  await walk("", 0, files, folders);
  files.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  const meta = await loadMeta();
  const byPath = new Map(meta.map((m) => [m.path, m]));

  const images: Img[] = files.slice(0, MAX_IMAGES).map((f) => {
    const m = byPath.get(f.path);
    const folder = m?.folder || dirOf(f.path);
    folders.add(folder);
    return {
      ...f,
      title: m?.title ?? null,
      altText: m?.alt_text ?? null,
      description: m?.description ?? null,
      shareScope: (m?.share_scope as ShareScope) ?? "internal",
      folder,
      source: "library",
    };
  });

  // A nested folder implies its ancestors exist too.
  for (const f of Array.from(folders)) {
    for (let p = parentOf(f); p; p = parentOf(p)) folders.add(p);
  }
  return { images, folders, meta };
}

/** Media Kit product photos, grouped Brand → product. Never fails the page. */
async function productSnapshot(): Promise<{ images: Img[]; folders: Folder[] }> {
  try {
    // PostgREST caps each response (1000 rows), so page — with a unique
    // tiebreaker, or .range() silently drops rows.
    type AssetRow = { part: string; asset_type: string; storage_path: string; created_at: string | null };
    const rows: AssetRow[] = [];
    for (let from = 0; from < MAX_PRODUCT_IMAGES; from += PAGE) {
      const { data, error } = await supabaseServer
        .from("media_kit_assets")
        .select("part, asset_type, storage_path, created_at")
        .order("created_at", { ascending: false })
        .order("storage_path", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      rows.push(...(data as AssetRow[]));
      if (data.length < PAGE) break;
    }
    if (rows.length === 0) return { images: [], folders: [] };

    type ProductRow = { part: string; display_name: string | null; fragrance: string | null; brand: string | null };
    const parts = Array.from(new Set(rows.map((r) => r.part)));
    const byPart = new Map<string, ProductRow>();
    for (let i = 0; i < parts.length; i += 200) {
      const { data } = await supabaseServer
        .from("inventory_products")
        .select("part, display_name, fragrance, brand")
        .in("part", parts.slice(i, i + 200));
      for (const p of (data ?? []) as ProductRow[]) byPart.set(p.part, p);
    }

    const images: Img[] = [];
    const folders = new Map<string, Folder>();
    for (const r of rows) {
      if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(r.storage_path)) continue;
      const p = byPart.get(r.part);
      const brand = p?.brand || "Other";
      const brandId = `${PRODUCT_PREFIX}-${slugFolder(brand) || "other"}`;
      const productId = `${brandId}/${r.part}`;
      const productName = productFolderName(p?.display_name ?? null, p?.fragrance ?? null, r.part);
      folders.set(brandId, { id: brandId, name: BRAND_NAMES[brand] ?? `${brand} Products`, readOnly: true });
      folders.set(productId, { id: productId, name: productName, readOnly: true });

      const { data: pub } = supabaseServer.storage.from(PRODUCT_BUCKET).getPublicUrl(r.storage_path);
      images.push({
        path: `${PRODUCT_BUCKET}:${r.storage_path}`,
        url: pub.publicUrl,
        size: 0,
        updatedAt: r.created_at,
        title: `${productName} — ${r.asset_type}`,
        altText: productName,
        description: null,
        // Reps already get Media Kit imagery on the portal.
        shareScope: "third_party",
        folder: productId,
        source: "product",
        productPart: r.part,
      });
    }
    return { images, folders: Array.from(folders.values()) };
  } catch {
    return { images: [], folders: [] };
  }
}

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [library, products] = await Promise.all([librarySnapshot(), productSnapshot()]);

  const folders: Folder[] = [
    ...Array.from(library.folders)
      .sort()
      .map((id) => ({ id, name: prettySegment(id.split("/").pop() ?? id), readOnly: id === ROOT })),
    ...products.folders.sort((a, b) => a.id.localeCompare(b.id)),
  ];

  return NextResponse.json({ images: [...library.images, ...products.images], folders });
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: string; parent?: string | null } | null;
  const slug = slugFolder(body?.name ?? "");
  if (!slug) {
    return NextResponse.json({ error: "Give the folder a name (letters or numbers)." }, { status: 400 });
  }
  const parent = body?.parent?.trim() || null;
  if (parent && !validFolder(parent)) {
    return NextResponse.json({ error: "Folders can't be created there." }, { status: 400 });
  }
  const folder = parent ? `${parent}/${slug}` : slug;
  if (!validFolder(folder)) {
    return NextResponse.json(
      { error: `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep.` },
      { status: 400 },
    );
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

  if (body?.folder != null && !validFolder(body.folder)) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }
  // Product photos are keyed "media-kit:<path>" and are read-only here.
  const isProduct = (p: string) => p.startsWith(`${PRODUCT_BUCKET}:`);

  const stamp = { updated_by: user.id, updated_at: new Date().toISOString() };

  // Bulk re-file: only the folder label changes; other metadata is untouched
  // (upsert only writes the columns present in each row).
  if (Array.isArray(body?.paths)) {
    if (body.folder === undefined) return NextResponse.json({ error: "Missing folder" }, { status: 400 });
    const paths = body.paths.map((p) => String(p).trim()).filter((p) => p && !isProduct(p));
    if (paths.length === 0) return NextResponse.json({ error: "No library images selected" }, { status: 400 });
    if (paths.length > MAX_IMAGES) return NextResponse.json({ error: "Too many images" }, { status: 400 });
    const rows = paths.map((p) => ({ path: p, folder: labelFor(p, body.folder ?? null), ...stamp }));
    const { error } = await supabaseServer.from("email_asset_meta").upsert(rows, { onConflict: "path" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const path = body?.path?.trim();
  if (!path) return NextResponse.json({ error: "Missing image path" }, { status: 400 });
  if (isProduct(path)) {
    return NextResponse.json({ error: "Product photos are edited on the product page." }, { status: 400 });
  }

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

  // Folder delete — only when nothing is filed in it or any subfolder. It only
  // ever removes the placeholder; images physically under the prefix but
  // re-filed elsewhere stay put.
  if (body?.folder !== undefined) {
    const folder = body.folder.trim();
    if (!validFolder(folder)) return NextResponse.json({ error: "Invalid folder" }, { status: 400 });

    const { images, folders, meta } = await librarySnapshot();
    const inside = (f: string | null | undefined) => !!f && (f === folder || f.startsWith(`${folder}/`));
    const busy =
      images.some((i) => inside(i.folder)) ||
      meta.some((m) => inside(m.folder)) ||
      Array.from(folders).some((f) => f.startsWith(`${folder}/`));
    if (busy) {
      return NextResponse.json({ error: "Only empty folders (with no subfolders) can be deleted." }, { status: 409 });
    }

    const { error: rmErr } = await supabaseServer.storage.from(BUCKET).remove([`${folder}/${PLACEHOLDER}`]);
    if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const path = body?.path?.trim();
  if (!path) return NextResponse.json({ error: "Missing image path" }, { status: 400 });
  if (path.startsWith(`${PRODUCT_BUCKET}:`)) {
    return NextResponse.json({ error: "Product photos are removed on the product page." }, { status: 400 });
  }

  const { error: rmErr } = await supabaseServer.storage.from(BUCKET).remove([path]);
  if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });

  // Object gone — drop the sidecar row too (ignore its error; the image is what matters).
  await supabaseServer.from("email_asset_meta").delete().eq("path", path);

  return NextResponse.json({ ok: true });
}
