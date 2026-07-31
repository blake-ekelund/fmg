/**
 * One-off pilot test for the Fishbowl estimate push (run manually):
 *   npx tsx scripts/test-fishbowl-estimate.ts [orderRefOrId]
 *
 * Picks a real storefront order (most recent non-cancelled with line items,
 * or the one named on the CLI), maps it with estimateRowsForOrder, and pushes
 * it to Fishbowl as an ESTIMATE under TEST CUSTOMER #2 — with "-APITEST"
 * appended to the SO number so it can't collide with the real workflow. Does
 * NOT stamp the orders row. Delete the estimate in the Fishbowl client when
 * done reviewing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Load .env.local before importing anything that reads env at call time.
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { createEstimate, runDataQuery } = await import("../lib/fishbowl");
  const { estimateRowsForOrder } = await import("../lib/fishbowlEstimate");
  const { orderRef } = await import("../lib/storefrontOrder");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const arg = process.argv[2];
  let query = admin
    .from("orders")
    .select("*")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(20);
  if (arg && /^[0-9a-f-]{36}$/i.test(arg)) query = admin.from("orders").select("*").eq("id", arg).limit(1);

  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);
  const order = (orders ?? []).find(
    (o) =>
      Array.isArray(o.items) &&
      o.items.some((it: { part?: string }) => it.part) &&
      (!arg || /^[0-9a-f-]{36}$/i.test(arg) || orderRef(o) === arg),
  );
  if (!order) throw new Error("No suitable order found (needs items with part numbers).");

  console.log(`Order: ${orderRef(order)} (${order.id})`);
  console.log(`  store=${order.store} channel=${order.channel} total=$${order.total}`);
  console.log(`  items=${order.items.length} discount=$${order.discount ?? 0} shipping=$${order.shipping ?? 0}`);

  const payload = estimateRowsForOrder(order, "TEST CUSTOMER #2");
  const testNum = `${payload.soNum}-APITEST`;
  const soNumCol = payload.rows[0].indexOf("SONum");
  for (let i = 1; i < payload.rows.length; i++) payload.rows[i][soNumCol] = testNum;

  console.log(`\nPushing as estimate ${testNum} under TEST CUSTOMER #2…`);
  const result = await createEstimate(testNum, "TEST CUSTOMER #2", payload.rows);
  console.log("Result:", result);

  const lines = await runDataQuery(
    `SELECT soitem.typeId, soitem.productNum, soitem.qtyOrdered, soitem.unitPrice, soitem.totalPrice
     FROM soitem WHERE soitem.soId = ${result.soId} ORDER BY soitem.id`,
  );
  const header = await runDataQuery(
    `SELECT so.num, so.totalPrice, SOSTATUS.name AS status, so.customerId, so.billToName, so.shipToCity
     FROM so LEFT JOIN SOSTATUS ON so.statusId = SOSTATUS.id WHERE so.id = ${result.soId}`,
  );
  console.log("\nFishbowl SO header:", JSON.stringify(header, null, 2));
  console.log("Fishbowl SO lines:", JSON.stringify(lines, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
