import { supabaseServer } from "@/lib/supabaseServer";
import { BRAND_NAMES, productName } from "@/lib/productImageNames";
import { optimizeImage, seoSlug, sha256 } from "./optimize";
import { describeImage, type ImageContext } from "./describe";
import { fragrancesOf, hasFragrance } from "./fragrance";

/**
 * One image, many places. SERVER ONLY (service role).
 *
 * Files live in two public buckets — `media-kit` (anything on a product or
 * fragrance; the storefronts build URLs from it) and `email-assets` (the
 * Image Library's own folders, emails, blog). `email_asset_meta` is the
 * registry for both, keyed "media-kit:<path>" / "<path>", and carries the
 * SHA-256 of the ORIGINAL upload so the same file is never stored twice.
 *
 * Putting an image somewhere is a LINK, never a copy:
 *   product   → a media_kit_assets row (part, storage_path, asset_type)
 *   fragrance → a fragrance_images row, materialized as media_kit_assets rows
 *               (shared_from) on every product with that scent
 * A file is deleted only when nothing links to it any more.
 */

export const PRODUCT_BUCKET = "media-kit";
export const LIBRARY_BUCKET = "email-assets";
export type Bucket = typeof PRODUCT_BUCKET | typeof LIBRARY_BUCKET;

export const metaKey = (bucket: Bucket, path: string) => (bucket === PRODUCT_BUCKET ? `${PRODUCT_BUCKET}:${path}` : path);

export function publicUrl(bucket: Bucket, path: string): string {
  return supabaseServer.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/* ─── Storing ─── */

export type Stored = {
  bucket: Bucket;
  path: string;
  url: string;
  sha: string;
  /** True when this exact file was already stored — nothing was uploaded. */
  deduped: boolean;
  /** The stored (optimized) bytes, for describing. */
  data: Buffer;
};

/** An existing stored copy of these original bytes in this bucket, if any. */
async function findByHash(sha: string, bucket: Bucket): Promise<string | null> {
  const { data, error } = await supabaseServer.from("email_asset_meta").select("path").eq("sha256", sha);
  if (error || !data) return null; // pre-migration: no sha256 column → no dedupe
  for (const r of data as { path: string }[]) {
    const isProduct = r.path.startsWith(`${PRODUCT_BUCKET}:`);
    if (bucket === PRODUCT_BUCKET && isProduct) return r.path.slice(PRODUCT_BUCKET.length + 1);
    if (bucket === LIBRARY_BUCKET && !isProduct) return r.path;
  }
  return null;
}

/** Record fingerprint + size on the registry row (tolerates the columns not existing yet). */
export async function recordFile(
  bucket: Bucket,
  path: string,
  info: { sha: string; bytes: number; width: number | null; height: number | null },
  extra: Record<string, unknown> = {},
): Promise<void> {
  const row = {
    path: metaKey(bucket, path),
    sha256: info.sha,
    bytes: info.bytes,
    width: info.width,
    height: info.height,
    updated_at: new Date().toISOString(),
    ...extra,
  };
  const { error } = await supabaseServer.from("email_asset_meta").upsert(row, { onConflict: "path" });
  if (error && /sha256|bytes|width|height|column/i.test(error.message)) {
    const { sha256: _s, bytes: _b, width: _w, height: _h, ...rest } = row;
    void _s; void _b; void _w; void _h;
    await supabaseServer.from("email_asset_meta").upsert(rest, { onConflict: "path" });
  }
}

/**
 * Store an upload once: fingerprint the original, reuse an existing copy in
 * the same bucket, else optimize for web and upload under a readable,
 * SEO-friendly name `<dir>/<baseName>-<hash8>.<ext>`.
 */
export async function storeImage(opts: {
  bytes: Buffer;
  contentType: string;
  bucket: Bucket;
  dir: string;
  baseName: string;
  extraMeta?: Record<string, unknown>;
}): Promise<Stored> {
  const sha = sha256(opts.bytes);
  const existing = await findByHash(sha, opts.bucket);
  if (existing) {
    return { bucket: opts.bucket, path: existing, url: publicUrl(opts.bucket, existing), sha, deduped: true, data: opts.bytes };
  }

  const out = await optimizeImage(opts.bytes, opts.contentType);
  const base = seoSlug(opts.baseName) || "image";
  const path = `${opts.dir.replace(/\/+$/, "")}/${base}-${sha.slice(0, 8)}.${out.ext}`;
  const { error } = await supabaseServer.storage.from(opts.bucket).upload(path, out.data, {
    contentType: out.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  // Same name = same content hash: someone stored it a moment ago. Fine.
  if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message);

  await recordFile(opts.bucket, path, { sha, bytes: out.data.length, width: out.width, height: out.height }, opts.extraMeta);
  return { bucket: opts.bucket, path, url: publicUrl(opts.bucket, path), sha, deduped: false, data: out.data };
}

/**
 * Sage drafts title / alt / description and fills ONLY the empty fields, so
 * nothing a person typed is overwritten. Never throws.
 */
export async function describeAndSave(bucket: Bucket, path: string, data: Buffer, ctx: ImageContext): Promise<boolean> {
  try {
    const key = metaKey(bucket, path);
    const { data: row } = await supabaseServer
      .from("email_asset_meta")
      .select("title, alt_text, description")
      .eq("path", key)
      .maybeSingle();
    const cur = (row ?? {}) as { title?: string | null; alt_text?: string | null; description?: string | null };
    if (cur.title && cur.alt_text && cur.description) return false;

    const d = await describeImage(data, ctx);
    if (!d) return false;
    const patch: Record<string, unknown> = { path: key, updated_at: new Date().toISOString() };
    if (!cur.title) patch.title = d.title;
    if (!cur.alt_text) patch.alt_text = d.altText;
    if (!cur.description) patch.description = d.description;
    const { error } = await supabaseServer
      .from("email_asset_meta")
      .upsert({ ...patch, ai_described_at: new Date().toISOString() }, { onConflict: "path" });
    if (error) await supabaseServer.from("email_asset_meta").upsert(patch, { onConflict: "path" });
    return true;
  } catch (e) {
    console.error("[images] describe failed:", path, e instanceof Error ? e.message : e);
    return false;
  }
}

/* ─── Products ─── */

export type ProductInfo = {
  part: string;
  brand: string | null;
  display_name: string | null;
  fragrance: string | null;
  is_tester: boolean | null;
};

export async function productInfo(part: string): Promise<ProductInfo | null> {
  const { data } = await supabaseServer
    .from("inventory_products")
    .select("part, brand, display_name, fragrance, is_tester")
    .eq("part", part)
    .maybeSingle();
  return (data as ProductInfo | null) ?? null;
}

/** Describing context + readable file name for a product photo. */
export function productNaming(p: ProductInfo, assetType: string): { baseName: string; ctx: ImageContext } {
  const brand = p.brand ? BRAND_NAMES[p.brand] ?? p.brand : null;
  const name = productName(p.display_name, p.fragrance, p.part);
  return {
    baseName: [p.brand === "NI" ? "natural-inspirations" : p.brand, name, assetType].filter(Boolean).join(" "),
    ctx: { brand, productName: name, fragrance: p.fragrance, photoType: assetType },
  };
}

/** Put a stored media-kit file on a product (idempotent). Returns the row id. */
export async function linkToProduct(part: string, storagePath: string, assetType: string, userId?: string): Promise<string> {
  const { data: have } = await supabaseServer
    .from("media_kit_assets")
    .select("id")
    .eq("part", part)
    .eq("storage_path", storagePath)
    .limit(1);
  if (have?.length) return (have[0] as { id: string }).id;
  const { data, error } = await supabaseServer
    .from("media_kit_assets")
    .insert({ part, asset_type: assetType, storage_path: storagePath, uploaded_by: userId ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/* ─── Fragrances ─── */

/** Attach a stored media-kit file to a fragrance; it then shows on every product with that scent. */
export async function attachToFragrance(opts: {
  brand: string;
  fragrance: string;
  storagePath: string;
  assetType?: string;
  userId?: string;
}): Promise<{ id: string; products: number }> {
  const { data: have } = await supabaseServer
    .from("fragrance_images")
    .select("id")
    .eq("brand", opts.brand)
    .ilike("fragrance", opts.fragrance)
    .eq("storage_path", opts.storagePath)
    .limit(1);
  let id = (have?.[0] as { id: string } | undefined)?.id;
  if (!id) {
    const { data, error } = await supabaseServer
      .from("fragrance_images")
      .insert({
        brand: opts.brand,
        fragrance: opts.fragrance,
        storage_path: opts.storagePath,
        asset_type: opts.assetType ?? "fragrance",
        created_by: opts.userId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    id = (data as { id: string }).id;
  }
  const res = await syncFragranceImages({ fragranceImageId: id });
  return { id, products: res.linkedProducts };
}

type FragranceImage = { id: string; brand: string; fragrance: string; storage_path: string; asset_type: string };

/**
 * Make media_kit_assets match the fragrance photos: every non-tester product
 * of the brand whose fragrance list includes the scent gets one shared row
 * per fragrance photo (unless hidden on that product), and shared rows whose
 * product no longer matches are removed. Scope with `part` (after a product's
 * fragrance changes) or `fragranceImageId` (after attaching one); no scope =
 * everything. Safe to run any time. No-op before the migration.
 */
export async function syncFragranceImages(scope: { part?: string; fragranceImageId?: string } = {}): Promise<{
  added: number;
  removed: number;
  linkedProducts: number;
}> {
  let fiQuery = supabaseServer.from("fragrance_images").select("id, brand, fragrance, storage_path, asset_type");
  if (scope.fragranceImageId) fiQuery = fiQuery.eq("id", scope.fragranceImageId);
  const { data: fiData, error: fiErr } = await fiQuery;
  if (fiErr) return { added: 0, removed: 0, linkedProducts: 0 };
  const fis = (fiData ?? []) as FragranceImage[];

  let pQuery = supabaseServer.from("inventory_products").select("part, brand, fragrance, is_tester");
  if (scope.part) pQuery = pQuery.eq("part", scope.part);
  else {
    const brands = Array.from(new Set(fis.map((f) => f.brand)));
    if (brands.length === 0 && scope.fragranceImageId) return { added: 0, removed: 0, linkedProducts: 0 };
    if (brands.length) pQuery = pQuery.in("brand", brands);
  }
  const { data: pData } = await pQuery;
  const products = (pData ?? []) as { part: string; brand: string | null; fragrance: string | null; is_tester: boolean | null }[];

  const { data: exData } = await supabaseServer.from("fragrance_image_exclusions").select("part, fragrance_image_id");
  const excluded = new Set(((exData ?? []) as { part: string; fragrance_image_id: string }[]).map((e) => `${e.part}|${e.fragrance_image_id}`));

  // Wanted: part|fiId
  const want = new Map<string, { part: string; fi: FragranceImage }>();
  const linked = new Set<string>();
  for (const fi of fis) {
    for (const p of products) {
      if (p.is_tester || p.brand !== fi.brand || !hasFragrance(p.fragrance, fi.fragrance)) continue;
      if (excluded.has(`${p.part}|${fi.id}`)) continue;
      want.set(`${p.part}|${fi.id}`, { part: p.part, fi });
      linked.add(p.part);
    }
  }

  // What's there now, in scope.
  const rowsQuery = () => {
    const q = supabaseServer.from("media_kit_assets").select("id, part, storage_path, shared_from");
    if (scope.part) return q.eq("part", scope.part);
    if (scope.fragranceImageId) {
      // Its shared rows, plus own rows holding the same file (to skip those products).
      return fis[0] ? q.or(`shared_from.eq.${fis[0].id},storage_path.eq."${fis[0].storage_path}"`) : q.eq("shared_from", scope.fragranceImageId);
    }
    return q.not("shared_from", "is", null);
  };
  const rows: { id: string; part: string; storage_path: string; shared_from: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await rowsQuery().order("id").range(from, from + 999);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  const have = new Set(rows.filter((r) => r.shared_from).map((r) => `${r.part}|${r.shared_from}`));
  // A product that already has this exact file on its own doesn't need a shared copy of the link.
  const ownPaths = new Set(rows.filter((r) => !r.shared_from).map((r) => `${r.part}|${r.storage_path}`));

  const inserts = Array.from(want.entries())
    .filter(([k, v]) => !have.has(k) && !ownPaths.has(`${v.part}|${v.fi.storage_path}`))
    .map(([, v]) => ({ part: v.part, asset_type: v.fi.asset_type, storage_path: v.fi.storage_path, shared_from: v.fi.id }));
  const stale = rows.filter((r) => r.shared_from && !want.has(`${r.part}|${r.shared_from}`)).map((r) => r.id);

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await supabaseServer.from("media_kit_assets").insert(inserts.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < stale.length; i += 200) {
    await supabaseServer.from("media_kit_assets").delete().in("id", stale.slice(i, i + 200));
  }
  return { added: inserts.length, removed: stale.length, linkedProducts: linked.size };
}

/** The one scent a product photo can be shared with, if the product has exactly one. */
export function singleFragrance(p: ProductInfo): string | null {
  const list = fragrancesOf(p.fragrance);
  return list.length === 1 ? list[0] : null;
}

/* ─── Removing ─── */

/**
 * Take a photo off one product. A shared fragrance photo is HIDDEN on this
 * product (so the sync won't bring it back); its file stays for the others.
 * The file itself goes only when nothing links to it any more.
 */
export async function removeProductPhoto(id: string): Promise<{ hidden: boolean }> {
  const { data: row, error } = await supabaseServer
    .from("media_kit_assets")
    .select("id, part, storage_path, shared_from")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { hidden: false };
  const r = row as { id: string; part: string; storage_path: string; shared_from?: string | null };
  if (r.shared_from) {
    await supabaseServer
      .from("fragrance_image_exclusions")
      .upsert({ part: r.part, fragrance_image_id: r.shared_from }, { onConflict: "part,fragrance_image_id" });
  }
  const { error: delErr } = await supabaseServer.from("media_kit_assets").delete().eq("id", id);
  if (delErr) throw new Error(delErr.message);
  if (!r.shared_from) await releaseFile(r.storage_path);
  return { hidden: !!r.shared_from };
}

/** Stop sharing a fragrance photo everywhere (removes it from every product). */
export async function removeFragranceImage(id: string): Promise<void> {
  const { data } = await supabaseServer.from("fragrance_images").select("storage_path").eq("id", id).maybeSingle();
  await supabaseServer.from("fragrance_images").delete().eq("id", id); // cascades shared rows + exclusions
  if (data) await releaseFile((data as { storage_path: string }).storage_path);
}

/** Delete a media-kit file (and its registry row) if nothing links to it. */
export async function releaseFile(storagePath: string): Promise<boolean> {
  const [{ count: rows }, fi] = await Promise.all([
    supabaseServer.from("media_kit_assets").select("id", { count: "exact", head: true }).eq("storage_path", storagePath),
    supabaseServer.from("fragrance_images").select("id", { count: "exact", head: true }).eq("storage_path", storagePath),
  ]);
  if ((rows ?? 0) > 0 || (fi.error ? 0 : fi.count ?? 0) > 0) return false;
  await supabaseServer.storage.from(PRODUCT_BUCKET).remove([storagePath]);
  await supabaseServer.from("email_asset_meta").delete().eq("path", metaKey(PRODUCT_BUCKET, storagePath));
  return true;
}
