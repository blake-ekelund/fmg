/** Fast check: does orders.scheduled_ship_date exist, and how many are filled? */
import { readFileSync } from "node:fs";
import path from "node:path";
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
async function main() {
  const { wholesalePortalAdmin } = await import("../lib/wholesalePortal");
  const admin = wholesalePortalAdmin();
  if (!admin) throw new Error("admin null");

  const probe = await admin.from("orders").select("id, scheduled_ship_date").limit(1);
  if (probe.error) {
    console.log(`scheduled_ship_date column: MISSING → ${probe.error.message}`);
    console.log("→ run `npx supabase db push` to apply migration 20260813000000.");
    return;
  }
  console.log("scheduled_ship_date column: EXISTS");

  const { data } = await admin
    .from("orders")
    .select("external_ref, source, scheduled_ship_date, shipped_at, fishbowl_entered_at")
    .in("source", ["faire", "markettime"]);
  const rows = data ?? [];
  const withDate = rows.filter((r) => r.scheduled_ship_date);
  console.log(`marketplace orders: ${rows.length}, with scheduled_ship_date: ${withDate.length}`);
  for (const r of withDate.slice(0, 5)) console.log(`  ${r.external_ref}: ${r.scheduled_ship_date}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
