/**
 * Backfill Fishbowl tracking onto marketplace (Faire/MarketTime) orders —
 * writes carrier/tracking_code/shipped_at ONLY. Sends NO customer email and NO
 * Faire notification (unlike the tracking-sync cron). Never clobbers an existing
 * tracking number.
 *   npx tsx scripts/backfill-marketplace-tracking.ts           # DRY
 *   npx tsx scripts/backfill-marketplace-tracking.ts --write
 */
import { readFileSync } from "node:fs";
import path from "node:path";
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const alnum = (s: string) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
/** Fishbowl datetimes have a malformed tz ("...000-05"); keep the calendar date. */
const parseShipDate = (v: unknown): string | null => {
  const m = String(v ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? `${m[1]}T12:00:00.000Z` : null;
};

async function main() {
  const write = process.argv.includes("--write");
  const { wholesalePortalAdmin } = await import("../lib/wholesalePortal");
  const { withFishbowl } = await import("../lib/fishbowl");
  const { resolveCarrier } = await import("../lib/tracking");
  const { orderRef } = await import("../lib/storefrontOrder");
  const admin = wholesalePortalAdmin();
  if (!admin) throw new Error("admin null");

  const { data } = await admin
    .from("orders")
    .select("id, source, external_ref, store, number, business_name, fishbowl_entered_at, tracking_code, status")
    .in("source", ["faire", "markettime"])
    .not("fishbowl_entered_at", "is", null)
    .is("tracking_code", null)
    .neq("status", "cancelled");

  const waiting = (data ?? [])
    .map((o) => ({ o, bareRef: alnum(String(o.external_ref ?? "")) }))
    .filter((w) => w.bareRef.length >= 6);

  const matched = await withFishbowl(async (query) => {
    const like = Array.from(new Set(waiting.map((w) => w.bareRef)))
      .map((r) => `so.customerPO LIKE '%${r}%'`)
      .join(" OR ");
    if (!like) return [];
    const cartons = (await query(
      `SELECT so.customerPO AS po, carrier.name AS carrier, shipcarton.trackingNum AS tracking, ship.dateShipped AS shipped
         FROM shipcarton JOIN ship ON shipcarton.shipId = ship.id JOIN so ON ship.soId = so.id
         LEFT JOIN carrier ON carrier.id = ship.carrierId
        WHERE shipcarton.trackingNum IS NOT NULL AND shipcarton.trackingNum <> '' AND ship.dateShipped IS NOT NULL
          AND (${like})`,
    )) as Array<Record<string, unknown>>;
    const idx = cartons.map((c) => ({ poAlnum: alnum(String(c.po ?? "")), c }));
    return waiting
      .map((w) => ({ w, hit: idx.find((x) => x.poAlnum.includes(w.bareRef))?.c }))
      .filter((m): m is { w: (typeof waiting)[number]; hit: Record<string, unknown> } => !!m.hit);
  });

  console.log(`${write ? "WRITE" : "DRY"} — ${matched.length} marketplace orders have Fishbowl tracking to apply:\n`);
  let done = 0;
  for (const { w, hit } of matched) {
    const carrier = resolveCarrier((hit.carrier as string) ?? null, String(hit.tracking));
    const ref = orderRef(w.o as never);
    const shippedAt = parseShipDate(hit.shipped) ?? new Date().toISOString();
    if (!write) {
      console.log(`  · ${ref}  ${hit.tracking} (${carrier})  shipped ${shippedAt.slice(0, 10)}`);
      continue;
    }
    const { error } = await admin
      .from("orders")
      .update({ carrier, tracking_code: String(hit.tracking), shipped_at: shippedAt })
      .eq("id", w.o.id)
      .is("tracking_code", null);
    if (error) console.log(`  ✗ ${ref}  ${error.message}`);
    else { done++; console.log(`  ✓ ${ref}  ${hit.tracking} (${carrier})  shipped ${shippedAt.slice(0, 10)}`); }
  }
  if (write) console.log(`\nStamped tracking on ${done} orders. No emails or Faire notifications sent.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e instanceof Error ? e.stack || e.message : e); process.exit(1); });
