/**
 * Backfill: stamp marketplace orders already keyed into Fishbowl (see
 * lib/fishbowlReconcile.ts). Same function the cron uses.
 *   npx tsx scripts/reconcile-fishbowl-marketplace.ts           # DRY (no writes)
 *   npx tsx scripts/reconcile-fishbowl-marketplace.ts --write    # stamp matches
 */
import { readFileSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const write = process.argv.includes("--write");
  const { wholesalePortalAdmin } = await import("../lib/wholesalePortal");
  const { reconcileMarketplaceFishbowl } = await import("../lib/fishbowlReconcile");

  const admin = wholesalePortalAdmin();
  if (!admin) throw new Error("wholesalePortalAdmin() null.");

  const result = await reconcileMarketplaceFishbowl(admin, { dry: !write });
  console.log(`${write ? "WRITE" : "DRY"} — checked ${result.checked}`);
  console.log(`\nStamped (${result.stamped.length}):`);
  for (const s of result.stamped) console.log(`  ✓ ${s.ref}  → SO ${s.soNum}  ($${s.total.toFixed(2)})  ship-by ${s.shipBy ?? "—"}  ${s.kind}`);
  console.log(`\nSkipped (${result.skipped.length}):`);
  for (const s of result.skipped) console.log(`  – ${s.ref}  (${s.reason})`);
  if (result.note) console.log(`\nnote: ${result.note}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.stack || e.message : e);
    process.exit(1);
  });
