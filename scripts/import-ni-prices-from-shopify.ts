/**
 * Import D2C prices for NI products from the live Shopify catalog at
 * naturalinspirations.com into inventory_products.msrp.
 *
 * Context: NI D2C prices were never entered in FMG (Shopify held them). This
 * backfills the ~130 blank msrp values from Shopify, matched by SKU == part.
 *
 * ⚠ SALE-PRICE GUARD: the live site runs a "Warehouse Sale", so Shopify
 * `variant.price` is often the DISCOUNTED price. Shopify keeps the regular
 * price in `compare_at_price` while on sale. So we import the REGULAR price:
 *     regular = (compare_at_price > price) ? compare_at_price : price
 * ...never the sale price. Items currently on sale are reported so you can eyeball them.
 *
 * Policy: FILL BLANKS ONLY (never overwrite an msrp already set in FMG).
 * Only writes msrp (the D2C price). Does not touch wholesale_price or compare_at_price.
 *
 * Run:
 *   npx tsx scripts/import-ni-prices-from-shopify.ts          # dry-run (default)
 *   npx tsx scripts/import-ni-prices-from-shopify.ts --apply   # write msrp
 *
 * Reads Supabase credentials from .env.local (SUPABASE_SERVICE_ROLE_KEY).
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();
import { createClient } from "@supabase/supabase-js";

const SHOP = "https://www.naturalinspirations.com";
const apply = process.argv.includes("--apply");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Variant = { sku: string | null; price: string | null; compare_at_price: string | null };
type ShopifyProduct = { title: string; variants: Variant[] };

async function fetchPage(page: number): Promise<ShopifyProduct[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${SHOP}/products.json?limit=250&page=${page}`, {
      headers: { "User-Agent": "FMG-catalog-sync/1.0 (+admin enrichment)" },
    });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Shopify page ${page}: HTTP ${res.status}`);
    return ((await res.json()) as { products: ShopifyProduct[] }).products ?? [];
  }
  throw new Error(`Shopify page ${page}: still rate-limited`);
}

async function fetchAll(): Promise<ShopifyProduct[]> {
  const out: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const products = await fetchPage(page);
    if (!products.length) break;
    out.push(...products);
    if (products.length < 250) break;
    await sleep(600);
  }
  return out;
}

const num = (s: string | null): number | null => {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Shopify price by SKU: { regular, sale (if on sale) }.
  const priceBySku = new Map<string, { regular: number; sale: number | null; title: string }>();
  for (const p of await fetchAll()) {
    for (const v of p.variants) {
      const sku = v.sku?.trim();
      if (!sku || priceBySku.has(sku)) continue;
      const price = num(v.price);
      const compareAt = num(v.compare_at_price);
      if (price == null) continue;
      const onSale = compareAt != null && compareAt > price;
      priceBySku.set(sku, {
        regular: onSale ? compareAt! : price,
        sale: onSale ? price : null,
        title: p.title,
      });
    }
  }

  const { data, error } = await supabase
    .from("inventory_products")
    .select("part, display_name, msrp, storefront_channel")
    .eq("brand", "NI")
    .order("part");
  if (error) throw error;

  const fills: { part: string; name: string; msrp: number; onSale: boolean; saleNote?: string }[] = [];
  let matched = 0;
  let alreadyPriced = 0;
  let skippedNonD2c = 0;
  const unmatched: string[] = [];

  // msrp is the D2C price. Only fill it for D2C-facing products (both / d2c);
  // wholesale-only rows (testers, displays, samples) use wholesale_price, not msrp.
  const isD2c = (ch: string | null) => ch === "both" || ch === "d2c";

  for (const p of data ?? []) {
    const hit = priceBySku.get(p.part);
    if (!isD2c(p.storefront_channel)) {
      skippedNonD2c++;
      continue;
    }
    if (p.msrp != null) {
      alreadyPriced++;
      continue;
    }
    if (!hit) {
      unmatched.push(`${p.part} ${p.display_name}`);
      continue;
    }
    matched++;
    fills.push({
      part: p.part,
      name: p.display_name,
      msrp: hit.regular,
      onSale: hit.sale != null,
      saleNote: hit.sale != null ? `Shopify on sale at $${hit.sale} — using regular $${hit.regular}` : undefined,
    });
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  console.log(`\nNI products:                 ${(data ?? []).length}`);
  console.log(`Skipped (wholesale-only):    ${skippedNonD2c}`);
  console.log(`D2C, already have an msrp:   ${alreadyPriced}`);
  console.log(`D2C, blank msrp, matched:    ${matched}`);
  console.log(`D2C, blank msrp, NO match:   ${unmatched.length}`);
  console.log(`Mode:                       ${apply ? "APPLY (writing msrp)" : "DRY-RUN (no writes)"}\n`);

  for (const f of fills) {
    console.log(`  ${f.part}  ${fmt(f.msrp).padStart(8)}  ${f.name}${f.onSale ? "   ⚑ " + f.saleNote : ""}`);
  }

  const onSaleCount = fills.filter((f) => f.onSale).length;
  if (onSaleCount) {
    console.log(`\n⚑ ${onSaleCount} of these are on sale on Shopify right now — imported the REGULAR (compare-at) price, not the sale price.`);
  }
  if (unmatched.length) {
    console.log(`\nBlank msrp with no Shopify match (${unmatched.length}) — priced manually or not on the retail site:`);
    for (const u of unmatched) console.log(`   - ${u}`);
  }

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to write ${fills.length} prices.\n`);
    return;
  }

  let ok = 0;
  for (const f of fills) {
    const { error: e } = await supabase.from("inventory_products").update({ msrp: f.msrp }).eq("part", f.part);
    if (e) console.error(`  ✗ ${f.part}: ${e.message}`);
    else ok++;
  }
  console.log(`\n✓ Wrote msrp for ${ok}/${fills.length} products.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
