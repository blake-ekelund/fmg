import { NextResponse, after } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { BRAND_NAMES } from "@/lib/productImageNames";
import { collectionOf } from "@/lib/images/fragrance";
import {
  LIBRARY_BUCKET,
  PRODUCT_BUCKET,
  attachToFragrance,
  describeAndSave,
  linkToProduct,
  productInfo,
  productNaming,
  singleFragrance,
  storeImage,
} from "@/lib/images/registry";
import { seoSlug } from "@/lib/images/optimize";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/images/upload — the ONE way images come in (multipart form).
 *
 *   file    the image
 *   target  JSON, one of:
 *     { kind: "product", part, assetType, share? }
 *         A product photo. A "fragrance" photo on a product with exactly one
 *         scent is attached to that FRAGRANCE instead (share !== false), so
 *         every product with the scent shows it — one file, not 16 copies.
 *     { kind: "fragrance", brand, fragrance, assetType? }
 *     { kind: "folder", folder }
 *         An Image Library folder. Product folders ("~products-<brand>/
 *         products/<part>") attach to that product; Collections folders
 *         (".../collections/<scent>") to that fragrance; anything else is a
 *         library folder in the email-assets bucket.
 *
 * Every upload is fingerprinted (an identical file is reused, never stored
 * twice), optimized for web, given a readable SEO file name, and — after the
 * response — described by Sage (title / alt text / description; only empty
 * fields are filled). Internal staff only.
 */

const PHOTO_TYPES = ["front", "benefits", "lifestyle", "ingredients", "fragrance", "other"];
const MAX_BYTES = 40 * 1024 * 1024;

type Target =
  | { kind: "product"; part: string; assetType?: string; share?: boolean }
  | { kind: "fragrance"; brand: string; fragrance: string; assetType?: string }
  | { kind: "folder"; folder: string };

function brandFromFolder(seg: string): string | null {
  // "~products-sassy" → "Sassy", "~products-ni" → "NI"
  const slug = seg.replace(/^~products-/, "");
  return Object.keys(BRAND_NAMES).find((b) => seoSlug(b) === slug) ?? null;
}

/** "~products-ni/collections/sea-salt" → the fragrance as products spell it. */
async function fragranceFromSlug(brand: string, slug: string): Promise<string | null> {
  const { data } = await supabaseServer.from("inventory_products").select("fragrance").eq("brand", brand);
  for (const r of (data ?? []) as { fragrance: string | null }[]) {
    const c = collectionOf(r.fragrance);
    if (c && seoSlug(c) === slug) return c;
  }
  return null;
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "That file isn't an image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Images must be under 40 MB." }, { status: 400 });
  let target: Target;
  try {
    target = JSON.parse(String(form?.get("target") ?? "")) as Target;
  } catch {
    return NextResponse.json({ error: "Missing upload target." }, { status: 400 });
  }
  const fileName = (file as File).name ?? "image";
  const bytes = Buffer.from(await file.arrayBuffer());

  // Library folder → resolve product / fragrance folders to those targets.
  if (target.kind === "folder") {
    const folder = String(target.folder ?? "").trim();
    const segs = folder.split("/");
    if (folder.startsWith("~products-")) {
      const brand = brandFromFolder(segs[0]);
      if (brand && segs[1] === "products" && segs[2]) {
        target = { kind: "product", part: segs[2], assetType: "other", share: false };
      } else if (brand && segs[1] === "collections" && segs[2]) {
        const fragrance = await fragranceFromSlug(brand, segs[2]);
        if (!fragrance) return NextResponse.json({ error: "Couldn't find that fragrance." }, { status: 400 });
        target = { kind: "fragrance", brand, fragrance };
      } else {
        return NextResponse.json(
          { error: "Open a product or a collection (fragrance) folder to upload product photos." },
          { status: 400 },
        );
      }
    } else if (folder.startsWith("~") || !folder || folder.includes("..")) {
      return NextResponse.json({ error: "Images can't be uploaded into that folder." }, { status: 400 });
    }
  }

  try {
    if (target.kind === "folder") {
      const base = fileName.replace(/\.[a-z0-9]+$/i, "");
      const stored = await storeImage({ bytes, contentType: file.type, bucket: LIBRARY_BUCKET, dir: target.folder, baseName: base });
      const folder = target.folder;
      if (!stored.deduped) {
        after(() => describeAndSave(LIBRARY_BUCKET, stored.path, stored.data, { folder, fileName }).then(() => undefined));
      }
      return NextResponse.json({ url: stored.url, path: stored.path, bucket: stored.bucket, deduped: stored.deduped });
    }

    if (target.kind === "product") {
      const part = String(target.part ?? "").trim();
      const assetType = PHOTO_TYPES.includes(target.assetType ?? "") ? target.assetType! : "other";
      const p = await productInfo(part);
      if (!p) return NextResponse.json({ error: "Product not found." }, { status: 404 });
      const scent = assetType === "fragrance" && target.share !== false && p.brand ? singleFragrance(p) : null;

      if (scent && p.brand) {
        const stored = await storeImage({
          bytes,
          contentType: file.type,
          bucket: PRODUCT_BUCKET,
          dir: `fragrances/${seoSlug(p.brand)}/${seoSlug(scent)}`,
          baseName: `${p.brand === "NI" ? "natural-inspirations" : p.brand} ${scent} fragrance`,
        });
        try {
          const res = await attachToFragrance({ brand: p.brand, fragrance: scent, storagePath: stored.path, userId: user.id });
          if (!stored.deduped) {
            const brandName = BRAND_NAMES[p.brand] ?? p.brand;
            after(() =>
              describeAndSave(PRODUCT_BUCKET, stored.path, stored.data, { brand: brandName, fragrance: scent, photoType: "fragrance" }).then(
                () => undefined,
              ),
            );
          }
          return NextResponse.json({
            url: stored.url,
            path: stored.path,
            bucket: stored.bucket,
            deduped: stored.deduped,
            sharedWith: { fragrance: scent, products: res.products },
          });
        } catch {
          // Fragrance tables not migrated yet — fall back to this product only.
          await linkToProduct(part, stored.path, assetType, user.id);
          return NextResponse.json({ url: stored.url, path: stored.path, bucket: stored.bucket, deduped: stored.deduped });
        }
      }

      const { baseName, ctx } = productNaming(p, assetType);
      const stored = await storeImage({
        bytes,
        contentType: file.type,
        bucket: PRODUCT_BUCKET,
        dir: `inventory_products/${part}/${assetType}`,
        baseName,
      });
      const id = await linkToProduct(part, stored.path, assetType, user.id);
      if (!stored.deduped) after(() => describeAndSave(PRODUCT_BUCKET, stored.path, stored.data, ctx).then(() => undefined));
      return NextResponse.json({ url: stored.url, path: stored.path, bucket: stored.bucket, deduped: stored.deduped, photoId: id });
    }

    // Fragrance
    const brand = String(target.brand ?? "").trim();
    const fragrance = String(target.fragrance ?? "").trim();
    if (!brand || !fragrance) return NextResponse.json({ error: "Missing brand or fragrance." }, { status: 400 });
    const assetType = PHOTO_TYPES.includes(target.assetType ?? "") ? target.assetType! : "fragrance";
    const stored = await storeImage({
      bytes,
      contentType: file.type,
      bucket: PRODUCT_BUCKET,
      dir: `fragrances/${seoSlug(brand)}/${seoSlug(fragrance)}`,
      baseName: `${brand === "NI" ? "natural-inspirations" : brand} ${fragrance} ${assetType}`,
    });
    const res = await attachToFragrance({ brand, fragrance, storagePath: stored.path, assetType, userId: user.id });
    if (!stored.deduped) {
      const brandName = BRAND_NAMES[brand] ?? brand;
      after(() =>
        describeAndSave(PRODUCT_BUCKET, stored.path, stored.data, { brand: brandName, fragrance, photoType: assetType }).then(() => undefined),
      );
    }
    return NextResponse.json({
      url: stored.url,
      path: stored.path,
      bucket: stored.bucket,
      deduped: stored.deduped,
      sharedWith: { fragrance, products: res.products },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed.";
    console.error("[images/upload]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
