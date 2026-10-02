import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { BRAND_PRODUCT_NAMES, productName as productFolderName } from "@/lib/productImageNames";

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
 * An image's folder is its `email_asset_meta.folder` label when set, else its
 * default: the landing folder for where it was uploaded from (Email / Blog /
 * Library uploads — see defaultFolder) or, for folder uploads, the storage
 * directory it was uploaded into. Re-filing only ever changes the label
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
/** Storefront gallery type order — matches HERO_PRIORITY in each storefront's lib/fmg/products.ts. */
const GALLERY_TYPE_ORDER = ["front", "lifestyle", "benefits", "ingredients", "fragrance", "other"];

/**
 * Landing ("inbox") folders: where uploads go when nobody picks a folder. Each
 * editor uploads into its own; older uploads made before these existed are
 * mapped in by the storage directory they were written to, so nothing moves.
 */
const EMAIL_INBOX = "email-uploads";
const BLOG_INBOX = "blog-uploads";
const LIBRARY_INBOX = "library-uploads";
const INBOX_NAMES: Record<string, string> = {
  [EMAIL_INBOX]: "Email uploads",
  [BLOG_INBOX]: "Blog uploads",
  [LIBRARY_INBOX]: "Library uploads",
};
/** Legacy storage dirs: email block images / section backgrounds, and blog. */
const EMAIL_LEGACY_DIRS = new Set(["images", "sections", "section-bg"]);
const BLOG_LEGACY_DIRS = new Set(["blog"]);
/** HTML-template uploads used to go to "<template uuid>/" or "unsaved/". */
const TEMPLATE_DIR = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|unsaved)$/i;

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

/** The folder an image shows in when it has no label: its inbox, else its directory. */
function defaultFolder(path: string): string {
  const dir = dirOf(path);
  if (dir === ROOT) return ROOT;
  const top = dir.split("/")[0];
  if (top in INBOX_NAMES) return top;
  if (EMAIL_LEGACY_DIRS.has(top) || TEMPLATE_DIR.test(top)) return EMAIL_INBOX;
  if (BLOG_LEGACY_DIRS.has(top)) return BLOG_INBOX;
  return dir;
}

/** A stored label pointing at a legacy upload dir ("images", "blog") means its inbox. */
function normalizeLabel(label: string): string {
  if (EMAIL_LEGACY_DIRS.has(label)) return EMAIL_INBOX;
  if (BLOG_LEGACY_DIRS.has(label)) return BLOG_INBOX;
  return label;
}

/** Store a label only when it differs from where the image shows by default. */
function labelFor(path: string, folder: string | null): string | null {
  return folder == null || folder === defaultFolder(path) ? null : folder;
}

/**
 * A product's scent collection ("Sea Salt", "Grapefruit"), from `fragrance`.
 * Null for placeholders and internal codes ("N/A", "Complete", "KLM",
 * "SSC/EUC/LAV") so they don't become junk folders.
 */
function collectionOf(fragrance: string | null): string | null {
  const f = fragrance?.trim();
  if (!f || /^(n\/a|complete|header|frag free)$/i.test(f) || f.includes("/") || /^[A-Z]{2,4}$/.test(f)) return null;
  return f;
}

/**
 * A product's category ("Mini Hand Creme", "Body Butter"), from `product_form`,
 * tidied so near-duplicates share one folder: brand tails dropped, holiday
 * variants folded in, per-scent lip butters / gift sets / displays grouped.
 */
function categoryOf(form: string | null, displayName: string | null): string | null {
  let c = (form || displayName || "").replace(/\s+[l|]\s+Sassy \+ Co\s*$/i, "").trim();
  if (!c) return null;
  if (/display|spinner|marketing materials/i.test(c)) return "Displays & Marketing";
  if (/gift set|prepack/i.test(c)) return "Gift Sets";
  if (/spf 30 lip butter/i.test(c)) return "SPF 30 Lip Butter";
  c = c.replace(/^holiday\s+/i, "");
  return c;
}

/**
 * A Sassy product line ("Everyday", "Holiday", "Love"), from `collection`.
 * Sassy only: NI's `collection` holds scent slugs, which Collections covers.
 */
function lineOf(brand: string, collection: string | null, displayName: string | null): string | null {
  if (brand !== "Sassy") return null;
  const c = collection?.trim();
  if (c) return c.replace(/[-_]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  // Displays often have no line set, but their name says it ("Sassy Holiday Lip Butter Display").
  const named = displayName?.match(/\b(everyday|holiday|love)\b/i)?.[1];
  return named ? named[0].toUpperCase() + named.slice(1).toLowerCase() : null;
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
  /** Product photos also show in these folders (their collection + category). */
  alsoIn?: string[];
};

type Folder = { id: string; name: string; readOnly: boolean; kind?: "inbox"; order?: number };

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
    const folder = m?.folder ? normalizeLabel(m.folder) : defaultFolder(f.path);
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

/**
 * Media Kit product photos, organized per brand several ways at once:
 *   <Brand> Products › Collections › Sea Salt
 *                   › Categories  › Body Butter
 *                   › Lines       › Holiday        (Sassy only)
 *                   › Products    › Body Butter · Sea Salt
 * Each photo has one home (its product folder) and `alsoIn` its collection,
 * category and line folders, so it shows up in each without being copied.
 * Testers live under Products only. Never fails the page.
 */
async function productSnapshot(): Promise<{ images: Img[]; folders: Folder[] }> {
  try {
    // PostgREST caps each response (1000 rows), so page — with a unique
    // tiebreaker, or .range() silently drops rows.
    // media_kit_assets has `uploaded_at`, not `created_at`.
    type AssetRow = {
      part: string;
      asset_type: string;
      storage_path: string;
      uploaded_at: string | null;
      sort_order: number | null;
    };
    const rows: AssetRow[] = [];
    for (let from = 0; from < MAX_PRODUCT_IMAGES; from += PAGE) {
      const { data, error } = await supabaseServer
        .from("media_kit_assets")
        .select("part, asset_type, storage_path, uploaded_at, sort_order")
        .order("uploaded_at", { ascending: false })
        .order("storage_path", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        // Don't fail the page, but don't hide it either — this once silently
        // emptied every product folder.
        console.error("[image-library] product photos query failed:", error.message);
        break;
      }
      if (!data) break;
      rows.push(...(data as AssetRow[]));
      if (data.length < PAGE) break;
    }
    if (rows.length === 0) return { images: [], folders: [] };

    type ProductRow = {
      part: string;
      display_name: string | null;
      fragrance: string | null;
      product_form: string | null;
      is_tester: boolean | null;
      collection: string | null;
      brand: string | null;
    };
    const parts = Array.from(new Set(rows.map((r) => r.part)));
    const byPart = new Map<string, ProductRow>();
    for (let i = 0; i < parts.length; i += 200) {
      const { data } = await supabaseServer
        .from("inventory_products")
        .select("part, display_name, fragrance, product_form, is_tester, collection, brand")
        .in("part", parts.slice(i, i + 200));
      for (const p of (data ?? []) as ProductRow[]) byPart.set(p.part, p);
    }

    // Order the way staff and shoppers see them: grouped by product (A→Z),
    // and within a product the drag order from the product page — or, if
    // nobody has reordered it, front → lifestyle → benefits → … like the
    // storefront gallery. Unordered photos follow ordered ones.
    const nameOf = (part: string) => {
      const p = byPart.get(part);
      return productFolderName(p?.display_name ?? null, p?.fragrance ?? null, part);
    };
    const typeRank = (t: string) => {
      const i = GALLERY_TYPE_ORDER.indexOf(t);
      return i === -1 ? GALLERY_TYPE_ORDER.length : i;
    };
    const customParts = new Set(rows.filter((r) => r.sort_order != null).map((r) => r.part));
    rows.sort(
      (a, b) =>
        nameOf(a.part).localeCompare(nameOf(b.part)) ||
        a.part.localeCompare(b.part) ||
        (customParts.has(a.part)
          ? (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
          : 0) ||
        typeRank(a.asset_type) - typeRank(b.asset_type) ||
        (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""),
    );

    // Titles / alt / descriptions set on the product page (keyed like `path` below).
    const { data: metaRows } = await supabaseServer
      .from("email_asset_meta")
      .select("path, title, alt_text, description")
      .like("path", `${PRODUCT_BUCKET}:%`);
    const metaByPath = new Map(
      ((metaRows ?? []) as { path: string; title: string | null; alt_text: string | null; description: string | null }[]).map(
        (m) => [m.path, m],
      ),
    );

    const images: Img[] = [];
    const folders = new Map<string, Folder>();
    for (const r of rows) {
      if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(r.storage_path)) continue;
      const p = byPart.get(r.part);
      const brand = p?.brand || "Other";
      const brandId = `${PRODUCT_PREFIX}-${slugFolder(brand) || "other"}`;
      const productName = productFolderName(p?.display_name ?? null, p?.fragrance ?? null, r.part);
      const group = (key: string, name: string, order: number) => {
        const id = `${brandId}/${key}`;
        folders.set(id, { id, name, readOnly: true, order });
        return id;
      };
      folders.set(brandId, { id: brandId, name: BRAND_PRODUCT_NAMES[brand] ?? `${brand} Products`, readOnly: true });
      const productId = `${group("products", "Products", 4)}/${r.part}`;
      folders.set(productId, { id: productId, name: productName, readOnly: true });

      const alsoIn: string[] = [];
      if (!p?.is_tester) {
        const collection = collectionOf(p?.fragrance ?? null);
        if (collection) {
          const id = `${group("collections", "Collections", 1)}/${slugFolder(collection)}`;
          folders.set(id, { id, name: collection, readOnly: true });
          alsoIn.push(id);
        }
        const category = categoryOf(p?.product_form ?? null, p?.display_name ?? null);
        if (category) {
          const id = `${group("categories", "Categories", 2)}/${slugFolder(category)}`;
          folders.set(id, { id, name: category, readOnly: true });
          alsoIn.push(id);
        }
        const line = lineOf(brand, p?.collection ?? null, p?.display_name ?? null);
        if (line) {
          const id = `${group("lines", "Lines", 3)}/${slugFolder(line)}`;
          folders.set(id, { id, name: line, readOnly: true });
          alsoIn.push(id);
        }
      }

      const { data: pub } = supabaseServer.storage.from(PRODUCT_BUCKET).getPublicUrl(r.storage_path);
      const key = `${PRODUCT_BUCKET}:${r.storage_path}`;
      const meta = metaByPath.get(key);
      images.push({
        path: key,
        url: pub.publicUrl,
        size: 0,
        updatedAt: r.uploaded_at,
        title: meta?.title || `${productName} — ${r.asset_type}`,
        altText: meta?.alt_text || productName,
        description: meta?.description ?? null,
        // Reps already get Media Kit imagery on the portal.
        shareScope: "third_party",
        folder: productId,
        source: "product",
        productPart: r.part,
        alsoIn,
      });
    }
    return { images, folders: Array.from(folders.values()) };
  } catch (e) {
    console.error("[image-library] product photos failed:", e);
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
      .map((id): Folder =>
        id in INBOX_NAMES
          ? { id, name: INBOX_NAMES[id], readOnly: false, kind: "inbox" }
          : { id, name: prettySegment(id.split("/").pop() ?? id), readOnly: id === ROOT },
      ),
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
