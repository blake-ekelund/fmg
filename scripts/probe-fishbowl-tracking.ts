/** READ-ONLY: inspect so.num / customerPO / carton tracking for a few known
 *  shipped Faire SOs, to ground the tracking-sync fix. Writes nothing.
 *    npx tsx scripts/probe-fishbowl-tracking.ts */
import { readFileSync } from "node:fs";
import path from "node:path";
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
async function main() {
  const { withFishbowl } = await import("../lib/fishbowl");
  const refs = ["ZJUHGM7VPR", "QM3VEWWRQ8", "GYD9MURARB", "BE4QR9CBYC"]; // shipped Faire refs
  await withFishbowl(async (query) => {
    // Decisive: do ANY bare-ref (Faire-style) POs have real carton tracking?
    const shippedFaire = await query(
      `SELECT so.num AS num, so.customerPO AS po, shipcarton.trackingNum AS tracking, ship.dateShipped AS shipped
         FROM shipcarton
         JOIN ship ON shipcarton.shipId = ship.id
         JOIN so ON ship.soId = so.id
        WHERE shipcarton.trackingNum IS NOT NULL AND shipcarton.trackingNum <> ''
          AND ship.dateShipped IS NOT NULL
          AND so.customerPO REGEXP '^#?[A-Z0-9]{10}$'
        ORDER BY ship.dateShipped DESC LIMIT 15`,
    );
    console.log(`Shipped SOs with a bare-ref (Faire-style) customerPO AND carton tracking: ${shippedFaire.length}`);
    for (const r of shippedFaire) console.log(`  num=${JSON.stringify(r.num)} po=${JSON.stringify(r.po)} tracking=${JSON.stringify(r.tracking)} shipped=${JSON.stringify(r.shipped)}`);

    for (const ref of refs) {
      const rows = await query(
        `SELECT so.id AS soId, so.num AS num, so.customerPO AS po,
                shipcarton.trackingNum AS tracking, ship.dateShipped AS shipped, carrier.name AS carrier
           FROM so
           LEFT JOIN ship ON ship.soId = so.id
           LEFT JOIN shipcarton ON shipcarton.shipId = ship.id
           LEFT JOIN carrier ON carrier.id = ship.carrierId
          WHERE so.customerPO LIKE '%${ref}%'`,
      );
      console.log(`\n── ${ref} ──`);
      for (const r of rows) console.log(`  soId=${r.soId} num=${JSON.stringify(r.num)} po=${JSON.stringify(r.po)} tracking=${JSON.stringify(r.tracking)} shipped=${JSON.stringify(r.shipped)} carrier=${JSON.stringify(r.carrier)}`);
      if (rows.length === 0) console.log("  (no rows)");
    }
  });
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
