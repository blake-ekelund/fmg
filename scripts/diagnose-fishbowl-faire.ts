/**
 * READ-ONLY diagnostic: do our unstamped Faire/MarketTime orders exist in
 * Fishbowl, and by what signal can we tell?  Writes nothing.
 *   npx tsx scripts/diagnose-fishbowl-faire.ts
 *
 * Checks three matching signals against Fishbowl's `so` table:
 *   1. customerPO contains the marketplace ref (the assumed convention)
 *   2. customer name + close date + equal total (the fuzzy fallback)
 *   3. how many SOs carry "FAIRE"/"MKTTIME" in customerPO at all
 */
import { readFileSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/** Longest alphanumeric token in a business name — used as a safe LIKE needle
 *  (no quotes/punctuation → no escaping, no injection surface). */
function nameNeedle(name: string | null): string | null {
  if (!name) return null;
  const tokens = name.toUpperCase().match(/[A-Z0-9]{3,}/g) ?? [];
  const skip = new Set(["THE", "AND", "LLC", "INC", "CO", "AND", "STORE", "SHOP", "GIFT", "GIFTS"]);
  const pick = tokens.filter((t) => !skip.has(t)).sort((a, b) => b.length - a.length)[0];
  return pick ?? tokens[0] ?? null;
}
const alnum = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");

async function main() {
  const { wholesalePortalAdmin } = await import("../lib/wholesalePortal");
  const { withFishbowl, fishbowlConfigured } = await import("../lib/fishbowl");
  const { orderRef } = await import("../lib/storefrontOrder");

  console.log("fishbowlConfigured:", fishbowlConfigured());
  const admin = wholesalePortalAdmin();
  if (!admin) throw new Error("wholesalePortalAdmin() null.");

  const { data: rows, error } = await admin
    .from("orders")
    .select("id, source, external_ref, store, number, business_name, total, created_at, fishbowl_entered_at, fishbowl_estimate_num")
    .in("source", ["faire", "markettime"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const all = rows ?? [];
  const unstamped = all.filter((o) => !o.fishbowl_entered_at);
  console.log(`\nMarketplace orders: ${all.length} total, ${unstamped.length} WITHOUT a fishbowl stamp.\n`);

  const sample = unstamped.slice(0, 12);

  await withFishbowl(async (query) => {
    // (3) global: does customerPO ever carry the marketplace suffix?
    for (const tag of ["FAIRE", "MKTTIME"]) {
      const c = await query(`SELECT COUNT(*) AS n FROM so WHERE customerPO LIKE '%${tag}%'`);
      console.log(`SOs with '${tag}' anywhere in customerPO: ${c?.[0]?.n ?? 0}`);
    }
    console.log("");

    // Per-order: try ref-in-PO, then name+total.
    for (const o of sample) {
      const ref = orderRef(o as never);
      const bareRef = alnum(String(o.external_ref ?? ""));
      const needle = nameNeedle(o.business_name as string | null);
      const total = Number(o.total ?? 0);

      let poHit: Record<string, unknown>[] = [];
      if (bareRef.length >= 4) {
        poHit = await query(
          `SELECT id, num, customerPO FROM so WHERE customerPO LIKE '%${bareRef}%' ORDER BY id DESC LIMIT 3`,
        );
      }

      let nameHit: Record<string, unknown>[] = [];
      if (needle) {
        nameHit = await query(
          `SELECT s.num, s.customerPO, s.totalPrice, s.dateCreated, c.name
             FROM so s JOIN customer c ON c.id = s.customerId
            WHERE c.name LIKE '%${needle}%'
            ORDER BY s.id DESC LIMIT 4`,
        );
      }
      const totalMatch = nameHit.find((r) => Math.abs(Number(r.totalPrice ?? -1) - total) < 0.01);

      console.log(`● ${ref}  "${o.business_name}"  $${total.toFixed(2)}  ${String(o.created_at).slice(0, 10)}`);
      console.log(`    PO-match (needle "${bareRef}"): ${poHit.length ? poHit.map((r) => `${r.num}[PO=${r.customerPO}]`).join(", ") : "none"}`);
      console.log(`    name-match (needle "${needle}"): ${nameHit.length} SO(s) under that customer${totalMatch ? ` — TOTAL MATCH on SO ${totalMatch.num} (PO=${totalMatch.customerPO})` : ""}`);
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.stack || e.message : e);
    process.exit(1);
  });
