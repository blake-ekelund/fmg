/**
 * Bills of materials, component stock, open purchase orders and vendor terms
 * out of Fishbowl — the raw material for the product page's BOM tab and the
 * Purchasing planner. Read-only, one Fishbowl session (one license seat).
 *
 * Shapes the data so the planning math (lib/bomPlan.ts) never has to know
 * about Fishbowl's quirks, which are handled here:
 *
 *  - ONE BOM PER PRODUCT. 8 products carry two active BOMs; the part's
 *    `defaultBomId` wins, else the lowest active BOM id.
 *  - UNITS. 171 BOM lines are in a different unit from the component's stock
 *    unit (a shipper is "1 × 6th of a box"; oz of a part stocked in lbs).
 *    Every quantity is converted to the component's STOCK unit via
 *    uomconversion (to = from × multiply ÷ factor), so it can be compared
 *    straight against on-hand. Open PO lines get the same treatment.
 *  - STOCK BY LOCATION. Components sit at the fillers (Kapra Cosmetics, the
 *    "FMG" group, Ecolips…), not at Point B, so on-hand is returned per
 *    location group and the client decides what's usable.
 *  - ON ORDER comes from open PO lines (Issued → Shipped, purchase lines
 *    only): Fishbowl's qtyonorder view is empty for components.
 *  - Lines only (type 20, Raw Good). Type 10 is the product the BOM makes,
 *    always quantity 1 on this account (verified 2026-10-28).
 */

import { withFishbowl } from "@/lib/fishbowl";

export type BomLine = {
  component: string;
  /** Per ONE finished unit, in the component's stock unit. */
  qtyPer: number;
  /** As written on the BOM, for display ("1 6thb"). */
  bomQty: number;
  bomUom: string | null;
};

export type Bom = { bomNum: string; lines: BomLine[] };

export type OpenPoLine = {
  po: string;
  vendor: string | null;
  /** Remaining to receive, in the part's stock unit. */
  remaining: number;
  unitCost: number | null;
  due: string | null;
  status: string;
};

export type BomPart = {
  part: string;
  description: string;
  uom: string | null;
  avgCost: number | null;
  vendor: string | null;
  vendorPartNumber: string | null;
  lastCost: number | null;
  /** Vendor minimum, in the vendor's unit — set on very few parts. */
  moq: number | null;
  leadTimeDays: number | null;
  /** Price on the most recent purchase order line (per stock unit) — the
   *  freshest price Fishbowl has. Null when the part was never bought. */
  lastPoCost: number | null;
  lastPoDate: string | null;
  lastPoVendor: string | null;
  /** Fishbowl on-hand per location group name. */
  stockByLocation: Record<string, number>;
  onOrder: number;
  openPos: OpenPoLine[];
};

export type BomUniverse = {
  /** Finished part → its BOM. */
  boms: Record<string, Bom>;
  /** Every part that makes or appears on a BOM. */
  parts: Record<string, BomPart>;
  loadedAt: string;
};

/** PO statuses that still have stock coming: Issued, Picking, Partial, Picked, Shipped. */
const OPEN_PO_STATUSES = "20,30,40,50,55";

/** Every part that makes or appears on an active BOM, as a subquery. The
 *  query travels in the URL, so an 800-part IN (...) list resets the
 *  connection; letting Fishbowl select the ids keeps it short. */
const BOM_PART_IDS = `SELECT bi.partId FROM bomitem bi JOIN bom b ON b.id = bi.bomId WHERE b.activeFlag = 1`;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();

/** to = from × multiply ÷ factor; same unit (or no conversion row) = 1. */
function convert(qty: number, multiply: unknown, factor: unknown): number {
  const m = numOrNull(multiply);
  const f = numOrNull(factor);
  if (m === null || f === null || f === 0) return qty;
  return (qty * m) / f;
}

let cache: { at: number; data: BomUniverse } | null = null;
const CACHE_MS = 5 * 60_000;

export async function loadBomUniverse(opts: { fresh?: boolean } = {}): Promise<BomUniverse> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const data = await withFishbowl(async (q) => {
    const bomRows = await q(`
      SELECT fg.num AS fg, fg.defaultBomId AS defaultBomId, bom.id AS bomId, bom.num AS bomNum,
             comp.num AS comp, bi.quantity AS qty, bu.code AS bomUom,
             uc.multiply AS mul, uc.factor AS fac
      FROM bom
      JOIN bomitem fgi ON fgi.bomId = bom.id AND fgi.typeId = 10
      JOIN part fg ON fg.id = fgi.partId
      JOIN bomitem bi ON bi.bomId = bom.id AND bi.typeId = 20
      JOIN part comp ON comp.id = bi.partId
      LEFT JOIN uom bu ON bu.id = bi.uomId
      LEFT JOIN uomconversion uc ON uc.fromUomId = bi.uomId AND uc.toUomId = comp.uomId
        AND bi.uomId <> comp.uomId
      WHERE bom.activeFlag = 1`);

    // Choose one BOM per finished part: its default, else the lowest id.
    const byFg = new Map<string, { defaultBomId: number | null; boms: Map<number, typeof bomRows> }>();
    for (const r of bomRows) {
      const fg = str(r.fg);
      const entry = byFg.get(fg) ?? { defaultBomId: numOrNull(r.defaultBomId), boms: new Map() };
      const id = num(r.bomId);
      const list = entry.boms.get(id) ?? [];
      list.push(r);
      entry.boms.set(id, list);
      byFg.set(fg, entry);
    }
    const boms: Record<string, Bom> = {};
    for (const [fg, entry] of byFg) {
      const ids = [...entry.boms.keys()].sort((a, b) => a - b);
      const chosen =
        entry.defaultBomId !== null && entry.boms.has(entry.defaultBomId) ? entry.defaultBomId : ids[0];
      const rows = entry.boms.get(chosen) ?? [];
      // A component listed twice on one BOM is summed, not overwritten.
      const lines = new Map<string, BomLine>();
      for (const r of rows) {
        const comp = str(r.comp);
        const bomQty = num(r.qty);
        const qtyPer = convert(bomQty, r.mul, r.fac);
        const prev = lines.get(comp);
        if (prev) {
          prev.qtyPer += qtyPer;
          prev.bomQty += bomQty;
        } else {
          lines.set(comp, { component: comp, qtyPer, bomQty, bomUom: str(r.bomUom) || null });
        }
      }
      boms[fg] = { bomNum: str(rows[0]?.bomNum), lines: [...lines.values()] };
    }

    const partNums = new Set<string>();
    for (const [fg, b] of Object.entries(boms)) {
      partNums.add(fg);
      for (const l of b.lines) partNums.add(l.component);
    }

    // Sequential on purpose: one session, one request at a time.
    const info = await
      q(`
        SELECT p.num AS part, p.description AS description, pu.code AS uom,
               pc.avgCost AS avgCost, v.name AS vendor, vp.vendorPartNumber AS vpn,
               vp.lastCost AS lastCost, vp.qtyMin AS moq, vp.leadTime AS leadTime
        FROM part p
        LEFT JOIN uom pu ON pu.id = p.uomId
        LEFT JOIN partcost pc ON pc.partId = p.id
        LEFT JOIN vendorparts vp ON vp.partId = p.id AND vp.defaultFlag = 1
        LEFT JOIN vendor v ON v.id = vp.vendorId
        WHERE p.id IN (${BOM_PART_IDS})`);
    const stock = await q(`
        SELECT p.num AS part, lg.name AS location, SUM(qv.qty) AS qty
        FROM qohview qv
        JOIN part p ON p.id = qv.partId
        JOIN locationgroup lg ON lg.id = qv.locationGroupId
        WHERE p.id IN (${BOM_PART_IDS})
        GROUP BY p.num, lg.name`);
    const pos = await q(`
        SELECT p.num AS part, po.num AS po, v.name AS vendor, ps.name AS status,
               (pi.qtyToFulfill - pi.qtyFulfilled) AS remaining, pi.unitCost AS unitCost,
               pi.dateScheduledFulfillment AS due, uc.multiply AS mul, uc.factor AS fac
        FROM poitem pi
        JOIN po ON po.id = pi.poId
        JOIN part p ON p.id = pi.partId
        LEFT JOIN vendor v ON v.id = po.vendorId
        LEFT JOIN postatus ps ON ps.id = po.statusId
        LEFT JOIN uomconversion uc ON uc.fromUomId = pi.uomId AND uc.toUomId = p.uomId
          AND pi.uomId <> p.uomId
        WHERE po.statusId IN (${OPEN_PO_STATUSES})
          AND pi.typeId = 10
          AND pi.qtyToFulfill > pi.qtyFulfilled
          AND p.id IN (${BOM_PART_IDS})`);

    // Current pricing: each part's most recent priced PO line (highest PO id —
    // ids are issued in order), excluding voided and never-issued POs. A line
    // in a bigger unit than the part's stock unit is converted to a per-unit
    // price: units = qty × multiply ÷ factor, so price = cost × factor ÷ multiply.
    const lastPrices = await q(`
        SELECT p.num AS part, pi.unitCost AS unitCost, po.dateIssued AS dateIssued,
               v.name AS vendor, uc.multiply AS mul, uc.factor AS fac
        FROM poitem pi
        JOIN po ON po.id = pi.poId
        JOIN part p ON p.id = pi.partId
        LEFT JOIN vendor v ON v.id = po.vendorId
        LEFT JOIN uomconversion uc ON uc.fromUomId = pi.uomId AND uc.toUomId = p.uomId
          AND pi.uomId <> p.uomId
        JOIN (
          SELECT pi2.partId AS partId, MAX(po2.id) AS lastPo
          FROM poitem pi2 JOIN po po2 ON po2.id = pi2.poId
          WHERE po2.statusId NOT IN (10, 15, 80) AND pi2.unitCost > 0 AND pi2.typeId = 10
          GROUP BY pi2.partId
        ) latest ON latest.partId = pi.partId AND latest.lastPo = po.id
        WHERE pi.unitCost > 0 AND pi.typeId = 10
          AND p.id IN (${BOM_PART_IDS})`);

    const parts: Record<string, BomPart> = {};
    const ensure = (part: string): BomPart =>
      (parts[part] ??= {
        part,
        description: "",
        uom: null,
        avgCost: null,
        vendor: null,
        vendorPartNumber: null,
        lastCost: null,
        moq: null,
        leadTimeDays: null,
        lastPoCost: null,
        lastPoDate: null,
        lastPoVendor: null,
        stockByLocation: {},
        onOrder: 0,
        openPos: [],
      });
    for (const p of partNums) ensure(p);

    for (const r of info) {
      const p = ensure(str(r.part));
      p.description = str(r.description);
      p.uom = str(r.uom) || null;
      p.avgCost = numOrNull(r.avgCost);
      p.vendor = str(r.vendor) || null;
      p.vendorPartNumber = str(r.vpn) || null;
      p.lastCost = numOrNull(r.lastCost);
      const moq = numOrNull(r.moq);
      p.moq = moq && moq > 0 ? moq : null;
      const lt = numOrNull(r.leadTime);
      p.leadTimeDays = lt && lt > 0 ? lt : null;
    }
    for (const r of stock) {
      const qty = num(r.qty);
      if (qty === 0) continue;
      ensure(str(r.part)).stockByLocation[str(r.location)] = qty;
    }
    for (const r of pos) {
      const p = ensure(str(r.part));
      const remaining = convert(num(r.remaining), r.mul, r.fac);
      p.onOrder += remaining;
      p.openPos.push({
        po: str(r.po),
        vendor: str(r.vendor) || null,
        remaining,
        unitCost: numOrNull(r.unitCost),
        due: str(r.due) || null,
        status: str(r.status),
      });
    }

    for (const r of lastPrices) {
      const p = parts[str(r.part)];
      if (!p) continue;
      const m = numOrNull(r.mul);
      const f = numOrNull(r.fac);
      const raw = num(r.unitCost);
      const perUnit = m && f ? (raw * f) / m : raw;
      // Two lines for the same part on the latest PO: keep the first price seen.
      if (p.lastPoCost === null) {
        p.lastPoCost = perUnit;
        p.lastPoDate = str(r.dateIssued) || null;
        p.lastPoVendor = str(r.vendor) || null;
      }
    }

    return { boms, parts, loadedAt: new Date().toISOString() } satisfies BomUniverse;
  });

  cache = { at: Date.now(), data };
  return data;
}
