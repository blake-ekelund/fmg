/**
 * Push on-hand inventory to Faire for SPECIFIC SKUs, or for the whole catalogue.
 *
 *   npx tsx scripts/push-faire-inventory.ts --dry 273-00-08     # show only
 *   npx tsx scripts/push-faire-inventory.ts --go  273-00-08     # WRITES to Faire
 *   npx tsx scripts/push-faire-inventory.ts --dry --all         # whole catalogue
 *   npx tsx scripts/push-faire-inventory.ts --go  --all         # WRITES everything
 *
 * WRITES TO LIVE LISTINGS with --go. Every published variant on this account
 * has allow_sales_when_out_of_stock = false, so a quantity we send is a gate
 * that can take a product off sale. --go therefore requires SKUs to be named
 * explicitly unless --all is also passed, and always prints the exact payload
 * plus a before/after read-back of what Faire holds.
 *
 * With --all there are two push paths: unambiguous SKUs go by SKU, and SKUs
 * that sit on more than one listing go by variant id (the base product gets the
 * count, refills stay untracked). See lib/faireInventory.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const show = (v: number | null | undefined) =>
  v === null || v === undefined ? "untracked" : String(v);

async function main() {
  const argv = process.argv.slice(2);
  const go = argv.includes("--go");
  const all = argv.includes("--all");
  const named = argv.filter((a) => !a.startsWith("--"));

  if (go && !all && named.length === 0) {
    console.log("--go needs explicit SKUs (or --all). Refusing to guess.");
    return;
  }

  const {
    levelsForSkus,
    pushInventoryLevels,
    pushInventoryByVariantIds,
    readFaireInventory,
    readFaireInventoryByVariantIds,
    faireSkuUniverse,
  } = await import("../lib/faireInventory");
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const universe = all ? await faireSkuUniverse() : null;
  const targets = universe ? universe.skus : named;
  const duplicates = universe?.duplicates ?? [];
  const resolved = duplicates.filter((d) => d.targetVariantId);
  const unresolved = duplicates.filter((d) => !d.targetVariantId);

  // Quantities for both paths come from the same snapshot lookup.
  const { levels, missing } = await levelsForSkus(admin, targets);
  const dupQuantities = await levelsForSkus(admin, resolved.map((d) => d.sku));
  const qtyBySku = new Map(dupQuantities.levels.map((l) => [l.sku, l.on_hand_quantity]));
  const variantLevels = resolved
    .filter((d) => qtyBySku.has(d.sku))
    .map((d) => ({
      product_variant_id: d.targetVariantId as string,
      on_hand_quantity: qtyBySku.get(d.sku) as number,
    }));

  const before = await readFaireInventory(targets);
  console.log(
    `targets: ${targets.length}   sendable by sku: ${levels.length}   no-snapshot-row: ${missing.length}   by variant id: ${variantLevels.length}\n`,
  );
  console.log("sku            faire on_hand   committed   ->  will send");
  for (const l of levels.slice(0, 25)) {
    const b = before.get(l.sku);
    console.log(
      `${l.sku.padEnd(14)} ${show(b?.onHand).padEnd(15)} ${show(b?.committed).padEnd(11)} ->  ${l.on_hand_quantity}`,
    );
  }
  if (levels.length > 25) console.log(`   … and ${levels.length - 25} more`);

  if (resolved.length) {
    console.log(`\nDUPLICATE SKUs — base listing gets the count, refills stay untracked:`);
    for (const d of resolved) {
      const q = qtyBySku.get(d.sku);
      console.log(
        `   ${d.sku.padEnd(12)} -> ${q === undefined ? "(no snapshot row, skipped)" : q} on "${d.targetProduct}"`,
      );
      for (const u of d.untracked) console.log(`${" ".repeat(19)}untracked: "${u}"`);
    }
  }
  if (unresolved.length) {
    console.log(`\nNEEDS A HUMAN (no count pushed — both listings keep selling):`);
    for (const d of unresolved) console.log(`   ${d.sku}: ${d.unresolved}`);
  }
  if (missing.length) {
    console.log(`\nNOT SENT (no availability row — sending 0 would delist these):`);
    console.log("   " + missing.join(", "));
  }

  console.log("\npayload sample (by sku):");
  console.log(JSON.stringify({ inventories: levels.slice(0, 2) }, null, 2));
  if (variantLevels.length) {
    console.log("payload sample (by variant id):");
    console.log(JSON.stringify({ inventories: variantLevels.slice(0, 2) }, null, 2));
  }

  if (!go) {
    const a = await pushInventoryLevels(levels, { confirm: false, dry: true });
    const b = await pushInventoryByVariantIds(variantLevels, { confirm: false, dry: true });
    console.log(`\nDRY RUN — nothing sent. ${a.detail} ${b.detail}`);
    return;
  }

  console.log(`\n--go: PATCHing ${levels.length} SKU(s) + ${variantLevels.length} variant(s)…`);
  console.log((await pushInventoryLevels(levels, { confirm: true })).detail);
  console.log((await pushInventoryByVariantIds(variantLevels, { confirm: true })).detail);

  // Faire applies writes asynchronously — an immediate read still reports the
  // old value and would look like a failed push (observed 2026-08-21; it lands
  // a few seconds later). Poll until the first SKU reflects what we sent.
  let after = await readFaireInventory(targets);
  for (let attempt = 0; attempt < 5 && levels.length; attempt++) {
    if (after.get(levels[0].sku)?.onHand === levels[0].on_hand_quantity) break;
    await new Promise((r) => setTimeout(r, 2000));
    after = await readFaireInventory(targets);
  }

  let changed = 0;
  const mismatched: string[] = [];
  for (const l of levels) {
    if (after.get(l.sku)?.onHand === l.on_hand_quantity) changed++;
    else mismatched.push(l.sku);
  }
  console.log(`\nread-back by sku: ${changed}/${levels.length} match what we sent.`);
  if (mismatched.length) console.log(`   MISMATCH: ${mismatched.slice(0, 20).join(", ")}`);

  if (variantLevels.length) {
    const afterV = await readFaireInventoryByVariantIds(
      variantLevels.map((v) => v.product_variant_id),
    );
    console.log("\nread-back by variant id:");
    for (const v of variantLevels) {
      const a = afterV.get(v.product_variant_id);
      const d = resolved.find((r) => r.targetVariantId === v.product_variant_id);
      console.log(
        `   ${String(d?.sku).padEnd(12)} sent=${String(v.on_hand_quantity).padEnd(7)} now=${show(a?.onHand).padEnd(9)} ${a?.onHand === v.on_hand_quantity ? "OK" : "MISMATCH"}  "${d?.targetProduct}"`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
