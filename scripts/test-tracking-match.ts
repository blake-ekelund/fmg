/**
 * READ-ONLY: prove the fixed tracking match finds Fishbowl tracking for our
 * marketplace orders. Mirrors the fishbowl-tracking-sync query (bare-ref
 * customerPO LIKE) but writes nothing.
 *   npx tsx scripts/test-tracking-match.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const alnum = (s: string) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

async function main() {
  const { wholesalePortalAdmin } = await import("../lib/wholesalePortal");
  const { withFishbowl } = await import("../lib/fishbowl");
  const { orderRef } = await import("../lib/storefrontOrder");
  const admin = wholesalePortalAdmin();
  if (!admin) throw new Error("admin null");

  const { data } = await admin
    .from("orders")
    .select("id, source, external_ref, store, number, business_name, fishbowl_entered_at, tracking_code")
    .in("source", ["faire", "markettime"])
    .not("fishbowl_entered_at", "is", null)
    .is("tracking_code", null);

  const waiting = (data ?? [])
    .map((o) => ({ o, bareRef: alnum(String(o.external_ref ?? "")) }))
    .filter((w) => w.bareRef.length >= 6);
  console.log(`Marketplace orders entered-but-untracked: ${waiting.length}\n`);

  await withFishbowl(async (query) => {
    const like = Array.from(new Set(waiting.map((w) => w.bareRef)))
      .map((r) => `so.customerPO LIKE '%${r}%'`)
      .join(" OR ");
    const cartons = (await query(
      `SELECT so.customerPO AS po, shipcarton.trackingNum AS tracking, carrier.name AS carrier, ship.dateShipped AS shipped
         FROM shipcarton JOIN ship ON shipcarton.shipId = ship.id JOIN so ON ship.soId = so.id
         LEFT JOIN carrier ON carrier.id = ship.carrierId
        WHERE shipcarton.trackingNum IS NOT NULL AND shipcarton.trackingNum <> '' AND ship.dateShipped IS NOT NULL
          AND (${like})`,
    )) as Array<Record<string, unknown>>;
    const idx = cartons.map((c) => ({ poAlnum: alnum(String(c.po ?? "")), c }));

    let hits = 0;
    for (const w of waiting) {
      const found = idx.find((x) => x.poAlnum.includes(w.bareRef));
      if (found) {
        hits++;
        console.log(`  ✓ ${orderRef(w.o as never)}  "${w.o.business_name}"  → ${found.c.tracking} (${found.c.carrier}) shipped ${String(found.c.shipped).slice(0, 10)}`);
      } else {
        console.log(`  · ${orderRef(w.o as never)}  "${w.o.business_name}"  → no tracking yet`);
      }
    }
    console.log(`\nWould populate tracking on ${hits}/${waiting.length} orders on the next run.`);
  });
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
