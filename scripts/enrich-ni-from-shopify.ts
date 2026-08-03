/**
 * Enrich FMG's NI products from the live Shopify catalog at
 * naturalinspirations.com.
 *
 * naturalinspirations.com runs on Shopify, which exposes a clean JSON feed at
 * /products.json. The Shopify variant `sku` is exactly our FMG `part` number
 * (e.g. "160-00-02"), so matching is an exact key join — no fuzzy title guessing.
 *
 * Policy (agreed with Blake, 2026-08-02):
 *   - FILL BLANKS ONLY. Never overwrite a value that's already set in FMG.
 *   - NEVER touch pricing (msrp / compare_at_price). FMG/Fishbowl owns price.
 *   - Names/forms are NOT pulled: the Shopify title bundles fragrance + form,
 *     but FMG's display_name/product_form deliberately exclude the fragrance
 *     (the NI storefront re-adds it). Pulling them would break the convention.
 *
 * What it fills:
 *   inventory_products.weight_oz      <- Shopify variant.grams / 28.3495
 *   inventory_products.category_path  <- Shopify product_type
 *   media_kit_products.long_description <- stripped Shopify body_html
 *
 * Images (Shopify images[]) are reported but NOT imported here — image section
 * tagging (front / fragrance / lifestyle) is a separate, human-guided pass.
 *
 * Run:
 *   npx tsx scripts/enrich-ni-from-shopify.ts            # dry-run (default) — prints a diff, writes nothing
 *   npx tsx scripts/enrich-ni-from-shopify.ts --apply    # write blanks-only fills
 *   npx tsx scripts/enrich-ni-from-shopify.ts --json      # dump the raw match table as JSON
 *
 * Reads Supabase credentials from .env.local (SUPABASE_SERVICE_ROLE_KEY).
 * Idempotent — safe to re-run; once a field is filled it stops being a candidate.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();
import { createClient } from "@supabase/supabase-js";

const SHOP = "https://www.naturalinspirations.com";
const GRAMS_PER_OZ = 28.3495;

type Args = { apply: boolean; json: boolean; categoryPath: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, json: false, categoryPath: false };
  for (const a of argv) {
    if (a === "--apply") args.apply = true;
    else if (a === "--json") args.json = true;
    else if (a === "--dry-run") args.apply = false;
    else if (a === "--category-path") args.categoryPath = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: npx tsx scripts/enrich-ni-from-shopify.ts [--apply] [--json] [--category-path]\n" +
          "  (default)        dry-run: print what would be filled, write nothing\n" +
          "  --apply          write blanks-only fills to Supabase\n" +
          "  --json           print the raw match table as JSON\n" +
          "  --category-path  also fill category_path from Shopify product_type (coarse; off by default)"
      );
      process.exit(0);
    }
  }
  return args;
}

// ── Shopify types (subset of /products.json we use) ──────────────────────────
type ShopifyVariant = {
  sku: string | null;
  grams: number | null;
  price: string | null;
};
type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  product_type: string | null;
  images: { src: string }[];
  variants: ShopifyVariant[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch a Shopify page, backing off politely on 429 (rate limit). */
async function fetchPage(page: number): Promise<ShopifyProduct[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${SHOP}/products.json?limit=250&page=${page}`, {
      headers: { "User-Agent": "FMG-catalog-sync/1.0 (+admin enrichment)" },
    });
    if (res.status === 429) {
      const wait = 2000 * (attempt + 1);
      console.error(`  … page ${page} rate-limited (429), waiting ${wait}ms`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Shopify page ${page}: HTTP ${res.status}`);
    const json = (await res.json()) as { products: ShopifyProduct[] };
    return json.products ?? [];
  }
  throw new Error(`Shopify page ${page}: still rate-limited after retries`);
}

async function fetchAllShopifyProducts(): Promise<ShopifyProduct[]> {
  const out: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const products = await fetchPage(page);
    if (!products.length) break;
    out.push(...products);
    if (products.length < 250) break;
    await sleep(600); // be gentle between pages
  }
  return out;
}

/** Index Shopify products by variant SKU → { product, variant }. */
function indexBySku(products: ShopifyProduct[]) {
  const map = new Map<string, { product: ShopifyProduct; variant: ShopifyVariant }>();
  for (const product of products) {
    for (const variant of product.variants) {
      const sku = variant.sku?.trim();
      if (sku && !map.has(sku)) map.set(sku, { product, variant });
    }
  }
  return map;
}

/**
 * A line that's wholesale/merchandising cruft rather than description copy —
 * e.g. "1 pc/pk", "12 pc/pk", "$0.50 ea, 12/pcs pk", "minimum 6". These lead
 * many Shopify bodies and don't belong in the storefront long description.
 */
function isPackCruft(line: string): boolean {
  const l = line.trim();
  if (!l) return false;
  return (
    /^\d+\s*pcs?\s*\/\s*pk$/i.test(l) ||
    /^\$[\d.]+\s*ea\b.*pk$/i.test(l) ||
    /^minimum\s+\d+$/i.test(l) ||
    /^\d+\s*\/\s*pcs?\s*pk$/i.test(l)
  );
}

/** Convert Shopify body_html to clean plain text for long_description. */
function htmlToText(html: string | null): string {
  if (!html) return "";
  const text = html
    .replace(/<!--.*?-->/gs, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  const lines = text.split("\n").map((l) => l.trim());
  // Drop leading pack/price cruft lines (and the blank lines after them).
  while (lines.length && (lines[0] === "" || isPackCruft(lines[0]))) lines.shift();
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isBlank(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

type Fill = { field: string; from: string; value: string | number; preview: string };

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Live Shopify catalog, indexed by SKU.
  const shopify = await fetchAllShopifyProducts();
  const bySku = indexBySku(shopify);

  // 2. Our NI products + their marketing copy.
  const { data: products, error: pErr } = await supabase
    .from("inventory_products")
    .select("part, display_name, weight_oz, category_path")
    .eq("brand", "NI");
  if (pErr) throw pErr;

  const parts = (products ?? []).map((p) => p.part);
  const { data: copyRows, error: cErr } = await supabase
    .from("media_kit_products")
    .select("part, long_description")
    .in("part", parts);
  if (cErr) throw cErr;
  const copyByPart = new Map((copyRows ?? []).map((r) => [r.part, r]));

  // 3. Match + compute blanks-only fills.
  const report: {
    part: string;
    name: string;
    matched: boolean;
    handle?: string;
    imageCount?: number;
    fills: Fill[];
  }[] = [];

  let matchedCount = 0;
  const invUpdates: { part: string; patch: Record<string, unknown> }[] = [];
  const copyUpserts: { part: string; long_description: string }[] = [];

  for (const p of products ?? []) {
    const hit = bySku.get(p.part);
    if (!hit) {
      report.push({ part: p.part, name: p.display_name, matched: false, fills: [] });
      continue;
    }
    matchedCount++;
    const { product, variant } = hit;
    const fills: Fill[] = [];
    const patch: Record<string, unknown> = {};

    // weight_oz <- grams. Skip when it rounds to 0 — filling 0 is meaningless
    // and would block a real value later (0 no longer reads as "blank").
    if (isBlank(p.weight_oz) && variant.grams && variant.grams > 0) {
      const oz = Math.round(variant.grams / GRAMS_PER_OZ);
      if (oz >= 1) {
        patch.weight_oz = oz;
        fills.push({ field: "weight_oz", from: `${variant.grams}g`, value: oz, preview: `${oz} oz` });
      }
    }

    // category_path <- product_type (opt-in: Shopify's product_type is coarse,
    // e.g. "Wash"/"Crème", a weaker fit than a full retail path).
    if (args.categoryPath && isBlank(p.category_path) && !isBlank(product.product_type)) {
      patch.category_path = product.product_type;
      fills.push({
        field: "category_path",
        from: "product_type",
        value: product.product_type!,
        preview: product.product_type!,
      });
    }

    // long_description <- body_html (media_kit_products)
    const existingCopy = copyByPart.get(p.part)?.long_description;
    const longDesc = htmlToText(product.body_html);
    if (isBlank(existingCopy) && longDesc) {
      copyUpserts.push({ part: p.part, long_description: longDesc });
      fills.push({
        field: "long_description",
        from: "body_html",
        value: longDesc,
        preview: longDesc.slice(0, 90) + (longDesc.length > 90 ? "…" : ""),
      });
    }

    if (Object.keys(patch).length > 0) invUpdates.push({ part: p.part, patch });

    report.push({
      part: p.part,
      name: p.display_name,
      matched: true,
      handle: product.handle,
      imageCount: product.images.length,
      fills,
    });
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // 4. Print human report.
  const withFills = report.filter((r) => r.fills.length > 0);
  console.log(`\nNI products in FMG:        ${(products ?? []).length}`);
  console.log(`Matched to Shopify by SKU: ${matchedCount}`);
  console.log(`Products with blank fills: ${withFills.length}`);
  console.log(`Mode:                      ${args.apply ? "APPLY (writing)" : "DRY-RUN (no writes)"}\n`);

  for (const r of withFills) {
    console.log(`● ${r.part}  ${r.name}  (${r.handle}, ${r.imageCount} imgs)`);
    for (const f of r.fills) {
      console.log(`    + ${f.field.padEnd(17)} ${f.preview}`);
    }
  }

  const unmatched = report.filter((r) => !r.matched);
  if (unmatched.length) {
    console.log(`\nUnmatched (not on the retail site — expected for testers/wholesale-only):`);
    for (const r of unmatched) console.log(`    - ${r.part}  ${r.name}`);
  }

  const totalFieldFills =
    invUpdates.reduce((n, u) => n + Object.keys(u.patch).length, 0) + copyUpserts.length;
  console.log(
    `\n${withFills.length} products, ${totalFieldFills} field fills ` +
      `(${invUpdates.length} inventory_products updates, ${copyUpserts.length} long_descriptions).`
  );

  if (!args.apply) {
    console.log(`\nDry-run only. Re-run with --apply to write these fills.\n`);
    return;
  }

  // 5. Apply — blanks-only, so re-running is idempotent.
  for (const u of invUpdates) {
    const { error } = await supabase.from("inventory_products").update(u.patch).eq("part", u.part);
    if (error) console.error(`  ✗ inventory_products ${u.part}: ${error.message}`);
  }
  for (const c of copyUpserts) {
    const { error } = await supabase.from("media_kit_products").upsert(
      { part: c.part, long_description: c.long_description, updated_at: new Date().toISOString() },
      { onConflict: "part" }
    );
    if (error) console.error(`  ✗ media_kit_products ${c.part}: ${error.message}`);
  }
  console.log(`\n✓ Applied ${totalFieldFills} fills across ${withFills.length} products.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
