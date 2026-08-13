/**
 * One-off: run the shared MarketTime import (same function the cron + "Sync
 * MarketTime" button call) from the CLI.
 *   npx tsx scripts/import-markettime-once.ts          # DRY (no writes)
 *   npx tsx scripts/import-markettime-once.ts --write   # actually insert rows
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
  const { markettimeConfigured } = await import("../lib/markettime");
  const { importMarketTimeOrders } = await import("../lib/markettimeImport");

  console.log("markettimeConfigured:", markettimeConfigured());
  const admin = wholesalePortalAdmin();
  if (!admin) throw new Error("wholesalePortalAdmin() null — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");

  const result = await importMarketTimeOrders(admin, { dry: !write });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("THREW:", e instanceof Error ? e.stack || e.message : e);
    process.exit(1);
  });
