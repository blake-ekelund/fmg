/**
 * Import product images for NI products from the live Shopify catalog at
 * naturalinspirations.com into FMG's media_kit_assets + the `media-kit` bucket.
 *
 * Matches by SKU == part. FILLS GAPS ONLY: for each product, an image is added
 * only for a section type the product is currently MISSING — never duplicates
 * a section that already has an image in FMG.
 *
 * Section classification (Shopify has no alt text; we key off position + filename):
 *   position 1                      -> front      (the hero/primary product shot)
 *   filename has fragrance|notes    -> fragrance  ("…-fragrance-notes.jpg")
 *   filename has ingredient         -> ingredients
 *   filename has benefit            -> benefits
 *   filename has back               -> other      (back-of-package panel)
 *   remaining (stack/bundle/model)  -> lifestyle  (extra angles / styled shots)
 *   fallback                        -> other
 * These are best-effort ESTIMATES — the mapping is printed in the dry-run so it
 * can be eyeballed before anything is written.
 *
 * Run:
 *   npx tsx scripts/import-ni-images-from-shopify.ts           # dry-run (default) — print the plan, write nothing
 *   npx tsx scripts/import-ni-images-from-shopify.ts --apply    # download + upload the missing images
 *   npx tsx scripts/import-ni-images-from-shopify.ts --part 140-00-01   # limit to one part (debug)
 *
 * Reads Supabase credentials from .env.local (SUPABASE_SERVICE_ROLE_KEY).
 * Idempotent-ish: re-running only fills section types still missing.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();
import { createClient } from "@supabase/supabase-js";

const SHOP = "https://www.naturalinspirations.com";
const BUCKET = "media-kit";
const apply = process.argv.includes("--apply");
const onlyPart = (() => {
  const i = process.argv.indexOf("--part");
  return i >= 0 ? process.argv[i + 1] : null;
})();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type AssetType = "front" | "benefits" | "lifestyle" | "ingredients" | "fragrance" | "other";
type ShImage = { src: string; position: number };
type ShProduct = { title: string; variants: { sku: string | null }[]; images: ShImage[] };

async function fetchPage(page: number): Promise<ShProduct[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${SHOP}/products.json?limit=250&page=${page}`, {
      headers: { "User-Agent": "FMG-catalog-sync/1.0 (+admin image import)" },
    });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Shopify page ${page}: HTTP ${res.status}`);
    return ((await res.json()) as { products: ShProduct[] }).products ?? [];
  }
  throw new Error(`Shopify page ${page}: still rate-limited`);
}

async function fetchAllShopify(): Promise<ShProduct[]> {
  const out: ShProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const products = await fetchPage(page);
    if (!products.length) break;
    out.push(...products);
    if (products.length < 250) break;
    await sleep(600);
  }
  return out;
}

function fileName(src: string): string {
  return src.split("/").pop()!.split("?")[0];
}

/** Estimate the FMG section for a Shopify image from its position + filename. */
function classify(src: string, index: number): AssetType {
  const fn = fileName(src).toLowerCase();
  if (index === 0) return "front"; // position 1 is always the hero shot
  if (/fragrance|notes/.test(fn)) return "fragrance";
  if (/ingredient/.test(fn)) return "ingredients";
  if (/benefit/.test(fn)) return "benefits";
  if (/back/.test(fn)) return "other";
  if (/lifestyle|model|bundle|stack|styled|hand|spa/.test(fn)) return "lifestyle";
  return "other";
}

function contentTypeFor(fn: string): string {
  const ext = fn.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

type Plan = { part: string; name: string; type: AssetType; src: string; fn: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Shopify images indexed by SKU.
  const bySku = new Map<string, ShProduct>();
  for (const p of await fetchAllShopify()) {
    for (const v of p.variants) {
      const sku = v.sku?.trim();
      if (sku && !bySku.has(sku)) bySku.set(sku, p);
    }
  }

  // NI products + which section types each already has.
  const { data: products, error: pErr } = await supabase
    .from("inventory_products")
    .select("part, display_name")
    .eq("brand", "NI");
  if (pErr) throw pErr;
  const parts = (products ?? []).map((p) => p.part).filter((p) => !onlyPart || p === onlyPart);

  const { data: assets, error: aErr } = await supabase
    .from("media_kit_assets")
    .select("part, asset_type")
    .in("part", parts);
  if (aErr) throw aErr;
  const haveTypes = new Map<string, Set<AssetType>>();
  for (const a of assets ?? []) {
    if (!haveTypes.has(a.part)) haveTypes.set(a.part, new Set());
    haveTypes.get(a.part)!.add(a.asset_type as AssetType);
  }

  // Build the fill plan: for each part, add images only for MISSING section types.
  const plans: Plan[] = [];
  let matched = 0;
  let noShopify = 0;
  const nameByPart = new Map((products ?? []).map((p) => [p.part, p.display_name as string]));

  for (const part of parts) {
    const sh = bySku.get(part);
    if (!sh) {
      noShopify++;
      continue;
    }
    matched++;
    const have = new Set(haveTypes.get(part) ?? []);
    const addedThisRun = new Set<AssetType>();
    // Sort images by position so index 0 is the hero.
    const imgs = [...sh.images].sort((a, b) => a.position - b.position);
    imgs.forEach((im, i) => {
      const type = classify(im.src, i);
      // Missing = not already in FMG. (front/fragrance/etc. are single-slot in
      // spirit, but lifestyle/other can accumulate — allow multiple within a run.)
      const singleSlot = type === "front" || type === "fragrance";
      if (have.has(type)) return;
      if (singleSlot && addedThisRun.has(type)) return;
      addedThisRun.add(type);
      plans.push({ part, name: nameByPart.get(part) ?? part, type, src: im.src, fn: fileName(im.src) });
    });
  }

  // ── Report ──
  const byType: Record<string, number> = {};
  for (const pl of plans) byType[pl.type] = (byType[pl.type] ?? 0) + 1;
  const partsTouched = new Set(plans.map((p) => p.part));

  console.log(`\nNI products:              ${parts.length}`);
  console.log(`Matched to Shopify:       ${matched}`);
  console.log(`No Shopify match:         ${noShopify}`);
  console.log(`Products getting images:  ${partsTouched.size}`);
  console.log(`Images to import:         ${plans.length}`);
  console.log(`By section:               ${JSON.stringify(byType)}`);
  console.log(`Mode:                     ${apply ? "APPLY (downloading + uploading)" : "DRY-RUN (no writes)"}\n`);

  // Show a per-product sample (or the single --part).
  const sampleParts = onlyPart ? [...partsTouched] : [...partsTouched].slice(0, 12);
  for (const part of sampleParts) {
    const rows = plans.filter((p) => p.part === part);
    console.log(`● ${part}  ${rows[0].name}`);
    for (const r of rows) console.log(`    ${r.type.padEnd(11)} ← ${r.fn}`);
  }
  if (!onlyPart && partsTouched.size > sampleParts.length) {
    console.log(`  … and ${partsTouched.size - sampleParts.length} more products`);
  }

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to download + upload ${plans.length} images.\n`);
    return;
  }

  // ── Apply: download from Shopify CDN, upload to media-kit, insert row ──
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < plans.length; i++) {
    const pl = plans[i];
    try {
      const res = await fetch(pl.src);
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = pl.fn.split(".").pop() || "jpg";
      const storagePath = `inventory_products/${pl.part}/${pl.type}/${pl.type}-${Date.now()}-${i}.${ext}`;
      const contentType = contentTypeFor(pl.fn);

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buf, { contentType, upsert: false });
      if (upErr) throw upErr;

      // Live media_kit_assets only has (part, asset_type, storage_path) — the
      // file_name/size/mime columns in types/supabase.ts aren't deployed yet.
      const { error: insErr } = await supabase.from("media_kit_assets").insert({
        part: pl.part,
        asset_type: pl.type,
        storage_path: storagePath,
      });
      if (insErr) throw insErr;
      ok++;
      if (ok % 25 === 0) console.log(`  … ${ok}/${plans.length} uploaded`);
      await sleep(150); // gentle on the Shopify CDN
    } catch (e) {
      fail++;
      console.error(`  ✗ ${pl.part} ${pl.type} (${pl.fn}): ${(e as Error).message}`);
    }
  }
  console.log(`\n✓ Imported ${ok} images across ${partsTouched.size} products${fail ? ` (${fail} failed)` : ""}.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
