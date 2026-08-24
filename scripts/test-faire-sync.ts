/**
 * Dry-run the Faire integration once FAIRE_ACCESS_TOKEN is in .env.local:
 *   npx tsx scripts/test-faire-sync.ts
 *
 * Fetches the brand's open Faire orders, prints how each would import
 * (ref, retailer, items, SKU coverage), and flags items whose SKU doesn't
 * match a Fishbowl part number. Writes NOTHING — the cron's ?dry=1 does the
 * same through the API once deployed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const { faireConfigured, getFaireOrders } = await import("../lib/faire");
  const { testerPartFor } = await import("../lib/faireTester");
  if (!faireConfigured()) {
    console.log("FAIRE_ACCESS_TOKEN is not set in .env.local — nothing to test yet.");
    return;
  }

  const orders = await getFaireOrders();
  console.log(`Open importable Faire orders: ${orders.length}\n`);

  const allSkus = new Set<string>();
  for (const o of orders) {
    console.log(`${(o.displayId + "-FAIRE").padEnd(18)} ${o.state.padEnd(12)} ${String(o.retailerName ?? "?").slice(0, 30).padEnd(32)} ${o.items.length} items  $${o.subtotal.toFixed(2)}`);
    for (const it of o.items) {
      console.log(`   ${(it.sku ?? "(NO SKU)").padEnd(14)} ×${String(it.quantity).padEnd(4)} $${it.price.toFixed(2).padEnd(8)} ${it.name ?? ""}${it.variant ? ` · ${it.variant}` : ""}`);
      if (it.sku) allSkus.add(it.sku);
      // Faire flags the tester on the regular line; the import expands it onto
      // the Fishbowl tester part (see lib/faireTester.ts).
      if (it.includesTester) {
        const tp = testerPartFor(it.sku);
        console.log(`   ${(tp ?? "(NO TESTER PART)").padEnd(14)} ×1    $${it.testerPrice.toFixed(2).padEnd(8)} └ TESTER`);
        if (tp) allSkus.add(tp);
      }
    }
  }

  // Do the SKUs exist as Fishbowl parts? (via inventory_products mirror)
  if (allSkus.size > 0) {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await admin
      .from("inventory_products")
      .select("part")
      .in("part", Array.from(allSkus));
    const known = new Set((data ?? []).map((r) => r.part as string));
    const unknown = Array.from(allSkus).filter((s) => !known.has(s));
    console.log(`\nSKU check: ${known.size}/${allSkus.size} match Fishbowl part numbers.`);
    if (unknown.length) console.log("Unmatched SKUs (fix in Faire product settings):", unknown.join(", "));
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
