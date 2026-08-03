/**
 * Bulk-set storefront_channel for all NI products.
 *
 * Policy (Blake, 2026-08-02):
 *   - Regular finished goods  -> "both"      (live on D2C + wholesale)
 *   - Testers and displays    -> "wholesale" (stockists only, never retail)
 *
 * Testers  = is_tester flag OR "TESTER" in the name.
 * Displays = name mentions display / spinner / ladder / tower / acrylic.
 *
 * Run:
 *   npx tsx scripts/set-ni-channels.ts           # dry-run (default) — classify + preview, no writes
 *   npx tsx scripts/set-ni-channels.ts --apply    # write storefront_channel
 *
 * Reads Supabase credentials from .env.local (SUPABASE_SERVICE_ROLE_KEY).
 * Only writes rows whose channel actually changes (idempotent).
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");

type Row = {
  part: string;
  display_name: string;
  product_type: string | null;
  is_tester: boolean | null;
  storefront_channel: string | null;
  msrp: number | null;
};

const isTester = (r: Row) => r.is_tester === true || /tester/i.test(r.display_name);
// Non-retail: fixtures + collateral, never sold to D2C shoppers.
// Displays / trays / spinners / ladders / towers / acrylic boxes + marketing materials.
const isNonRetail = (r: Row) =>
  /\b(display|tray|spinner|ladder|tower|header|fixture|rack|stand|sample|packet)\b|acrylic|marketing material/i.test(
    r.display_name
  );

function targetChannel(r: Row): "both" | "wholesale" {
  return isTester(r) || isNonRetail(r) ? "wholesale" : "both";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("inventory_products")
    .select("part, display_name, product_type, is_tester, storefront_channel, msrp")
    .eq("brand", "NI")
    .order("part");
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const classified = rows.map((r) => {
    const target = targetChannel(r);
    const reason = isTester(r) ? "tester" : isNonRetail(r) ? "non-retail" : "regular";
    return { r, target, reason, changed: r.storefront_channel !== target };
  });

  const toBoth = classified.filter((c) => c.target === "both");
  const toWholesale = classified.filter((c) => c.target === "wholesale");
  const changes = classified.filter((c) => c.changed);

  console.log(`\nNI products: ${rows.length}`);
  console.log(`  -> both       (D2C + wholesale): ${toBoth.length}`);
  console.log(`  -> wholesale  (testers+displays): ${toWholesale.length}`);
  console.log(`Rows changing channel: ${changes.length}`);
  console.log(`Mode: ${apply ? "APPLY (writing)" : "DRY-RUN (no writes)"}\n`);

  // Flag things worth a human glance.
  const nonFg = classified.filter((c) => c.r.product_type !== "FG");
  const bothNoPrice = toBoth.filter((c) => c.r.msrp == null);

  console.log("Testers + displays -> wholesale:");
  for (const c of toWholesale) console.log(`   ${c.reason.padEnd(8)} ${c.r.part}  ${c.r.display_name}`);

  if (nonFg.length) {
    console.log(`\n⚠ Non-FG rows (${nonFg.length}) — components/BOM. Storefront view only shows FG, so these stay hidden regardless:`);
    for (const c of nonFg) console.log(`   ${c.r.part}  [${c.r.product_type}]  ${c.r.display_name} -> ${c.target}`);
  }
  if (bothNoPrice.length) {
    console.log(`\n⚠ Going to "both" but have NO msrp (${bothNoPrice.length}) — D2C shoppers would see them without a price:`);
    for (const c of bothNoPrice) console.log(`   ${c.r.part}  ${c.r.display_name}`);
  }

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to write.\n`);
    return;
  }

  let ok = 0;
  for (const c of changes) {
    const { error: e } = await supabase
      .from("inventory_products")
      .update({ storefront_channel: c.target })
      .eq("part", c.r.part);
    if (e) console.error(`  ✗ ${c.r.part}: ${e.message}`);
    else ok++;
  }
  console.log(`\n✓ Updated ${ok}/${changes.length} rows.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
