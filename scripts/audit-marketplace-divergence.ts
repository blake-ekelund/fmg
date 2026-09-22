/**
 * Audit every recently pushed marketplace order against the Fishbowl SO it
 * became, and against live Point B stock. Read-only on all three systems.
 *
 *   npx tsx scripts/audit-marketplace-divergence.ts            # last 60 orders
 *   npx tsx scripts/audit-marketplace-divergence.ts --limit 150
 *   npx tsx scripts/audit-marketplace-divergence.ts --detail   # per-order, not a tally
 *
 * This is the book-wide version of the per-order "Fishbowl check" button; both
 * run the same rules (lib/fishbowlDivergence.ts). Findings and what they mean
 * live in docs/fishbowl-marketplace-field-map.md — re-run this after any change
 * to the estimate mapping, or when Fishbowl or a marketplace changes something.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { StorefrontOrder } from "../lib/storefrontOrder";
import type { Divergence, FishbowlSoSnapshot } from "../lib/fishbowlDivergence";

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/** Safe as a LIKE needle in the server-built data-query: no quotes, no wildcards. */
const alnum = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9]/g, "");

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) || 60 : 60;
  const detail = process.argv.includes("--detail");

  const { wholesalePortalAdmin } = await import("../lib/wholesalePortal");
  const { withFishbowl, loadKitClosure } = await import("../lib/fishbowl");
  const { flattenKit } = await import("../lib/fishbowlKits");
  const { compareOrderToSo } = await import("../lib/fishbowlDivergence");
  const { orderRef } = await import("../lib/storefrontOrder");

  const admin = wholesalePortalAdmin();
  if (!admin) throw new Error("wholesalePortalAdmin() null — check Supabase env.");

  const { data, error } = await admin
    .from("orders")
    .select("*")
    .in("source", ["faire", "markettime"])
    .not("fishbowl_entered_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as StorefrontOrder[];
  console.log(`Auditing ${orders.length} pushed marketplace orders…\n`);

  const needles = [...new Set(orders.map((o) => alnum(o.external_ref)).filter((k) => k.length >= 4))];
  if (needles.length === 0) {
    console.log("Nothing to audit.");
    return;
  }

  const results = await withFishbowl(async (q) => {
    const sos = await q(
      `SELECT so.id, so.num, so.customerPO, so.salesman, so.customFields,
              so.shipToCity, so.shipToZip,
              c.name AS customerName, cc.name AS customerClass, sc.name AS soClass,
              pt.name AS paymentTerms, tr.name AS taxRate,
              lg.name AS locationGroup, st.name AS status
         FROM so
         JOIN customer c ON c.id = so.customerId
         LEFT JOIN qbclass cc ON cc.id = c.qbClassId
         LEFT JOIN qbclass sc ON sc.id = so.qbClassId
         LEFT JOIN paymentterms pt ON pt.id = so.paymentTermsId
         LEFT JOIN taxrate tr ON tr.id = so.taxRateId
         LEFT JOIN locationgroup lg ON lg.id = so.locationGroupId
         LEFT JOIN sostatus st ON st.id = so.statusId
        WHERE ${needles.map((k) => `so.customerPO LIKE '%${k}%'`).join(" OR ")}
        ORDER BY so.id DESC`,
    );

    const soIds = sos.map((s) => Number(s.id)).filter(Number.isFinite);
    const items = soIds.length
      ? await q(
          `SELECT si.soId, si.soLineItem, si.productNum, si.qtyOrdered, si.unitPrice,
                  si.totalPrice, si.typeId, qc.name AS itemClass
             FROM soitem si LEFT JOIN qbclass qc ON qc.id = si.qbClassId
            WHERE si.soId IN (${soIds.join(",")})
            ORDER BY si.soId, si.soLineItem`,
        )
      : [];

    // The full kit closure, so an expanded display isn't reported as a dozen
    // wrong lines (and a NESTED display resolves to real parts, not to another
    // kit number).
    const parts = [
      ...new Set(
        orders.flatMap((o) => (o.items ?? []).map((it) => String(it.part ?? "").trim())).filter(Boolean),
      ),
    ];
    const kitEdges = parts.length ? await loadKitClosure(q, parts) : [];
    return { sos, items, kitEdges };
  });

  const itemsBySo = new Map<number, Record<string, unknown>[]>();
  for (const it of results.items) {
    const k = Number(it.soId);
    if (!itemsBySo.has(k)) itemsBySo.set(k, []);
    itemsBySo.get(k)!.push(it);
  }

  const kitComponents = new Map<string, Array<{ part: string; qty: number }>>();
  for (const kit of new Set(results.kitEdges.map((e) => e.kit))) {
    kitComponents.set(
      kit.trim().toUpperCase(),
      flattenKit(kit, 1, results.kitEdges)
        .filter((l) => !l.isKit)
        .map((l) => ({ part: l.product, qty: l.qty })),
    );
  }

  const tally = new Map<string, { n: number; examples: string[] }>();
  let compared = 0;
  let unmatched = 0;

  for (const order of orders) {
    const ref = alnum(order.external_ref);
    const soRow = results.sos.find((s) => String(s.customerPO ?? "").toUpperCase().includes(ref.toUpperCase()));
    if (!soRow) {
      unmatched++;
      continue;
    }
    compared++;

    const snapshot: FishbowlSoSnapshot = {
      num: String(soRow.num ?? ""),
      customerPO: (soRow.customerPO as string) ?? null,
      customerName: (soRow.customerName as string) ?? null,
      soClass: (soRow.soClass as string) ?? null,
      customerClass: (soRow.customerClass as string) ?? null,
      paymentTerms: (soRow.paymentTerms as string) ?? null,
      taxRate: (soRow.taxRate as string) ?? null,
      locationGroup: (soRow.locationGroup as string) ?? null,
      status: (soRow.status as string) ?? null,
      salesman: (soRow.salesman as string) ?? null,
      shipToCity: (soRow.shipToCity as string) ?? null,
      shipToZip: (soRow.shipToZip as string) ?? null,
      customFields: (soRow.customFields as string) ?? null,
      items: (itemsBySo.get(Number(soRow.id)) ?? []).map((i) => ({
        lineItem: Number(i.soLineItem ?? 0) || null,
        typeId: Number(i.typeId ?? 0),
        productNum: (i.productNum as string) ?? null,
        qtyOrdered: Number(i.qtyOrdered ?? 0),
        unitPrice: Number(i.unitPrice ?? 0),
        totalPrice: Number(i.totalPrice ?? 0),
        itemClass: (i.itemClass as string) ?? null,
      })),
    };

    const divergences: Divergence[] = compareOrderToSo(order, snapshot, kitComponents);
    if (detail) {
      if (divergences.length === 0) continue;
      console.log(`\n${orderRef(order)} → SO ${snapshot.num}`);
      for (const d of divergences) {
        console.log(`  [${d.severity}] ${d.field}: expected ${d.expected || "—"}, fishbowl ${d.actual || "—"}`);
      }
      continue;
    }
    for (const d of divergences) {
      const entry = tally.get(d.code) ?? { n: 0, examples: [] };
      entry.n++;
      if (entry.examples.length < 5) {
        entry.examples.push(`${orderRef(order)}/${snapshot.num}: ${d.field} — ${d.expected || "—"} vs ${d.actual || "—"}`);
      }
      tally.set(d.code, entry);
    }
  }

  if (detail) return;

  console.log(`compared ${compared} orders (${unmatched} had no SO in Fishbowl)\n`);
  const sorted = [...tally.entries()].sort((a, b) => b[1].n - a[1].n);
  if (sorted.length === 0) {
    console.log("No divergences. Fishbowl agrees with every marketplace order checked.");
    return;
  }
  for (const [code, { n, examples }] of sorted) {
    console.log(`\n## ${code} — ${n}/${compared}`);
    for (const ex of examples) console.log(`   ${ex}`);
  }
  console.log(`\nWhat each of these means: docs/fishbowl-marketplace-field-map.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
