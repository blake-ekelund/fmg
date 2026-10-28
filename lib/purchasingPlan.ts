/**
 * The Purchasing plan, as one set of pure functions shared by the Purchasing
 * page (in the browser) and Sage (on the server) — so what Sage tells the
 * founder is exactly what the page shows.
 *
 * Inputs are already-resolved numbers: product on-hand / on-order / demand
 * (Point B first, the Inventory page's rule), component supply, the BOM
 * universe and the ordering rules people set. Out comes, per family: what to
 * make, what to buy from whom, how urgent, and what to move to Kapra.
 */

import type { BomPart } from "./fishbowlBom";
import {
  FILLER_LOCATION,
  awayFromFiller,
  isFill,
  leadDaysFor,
  orderQty,
  orderUrgency,
  planRequirements,
  priceFor,
  vendorFor,
  type Boms,
  type Family,
  type PartSetting,
  type PriceSource,
  type Requirement,
  type Urgency,
  type VendorSetting,
} from "./bomPlan";

export const NO_VENDOR = "No vendor on file";

/** Same statuses and thresholds as the Inventory page (forecasting/types.ts). */
export type PlanStatus = "at risk" | "needs review" | "healthy" | "no demand";
export function statusFor(onHand: number, onOrder: number, avg: number): PlanStatus {
  if (avg <= 0) return "no demand";
  const mos = (onHand + onOrder) / avg;
  if (mos > 3) return "healthy";
  if (mos > 1.5) return "needs review";
  return "at risk";
}

export type PlanRow = {
  part: string;
  name: string;
  status: PlanStatus;
  onHand: number;
  onOrder: number;
  avg: number;
  have: number;
  /** Months of cover: (on hand + on order) ÷ avg. Null with no demand. */
  cover: number | null;
  /** Units to make to reach the target months. */
  suggested: number;
};

export function toPlanRow(
  part: string,
  name: string,
  onHand: number,
  onOrder: number,
  avg: number,
  targetMonths: number,
): PlanRow {
  const have = onHand + onOrder;
  return {
    part,
    name,
    status: statusFor(onHand, onOrder, avg),
    onHand,
    onOrder,
    avg,
    have,
    cover: avg > 0 ? have / avg : null,
    suggested: avg > 0 ? Math.max(0, Math.ceil(targetMonths * avg - have)) : 0,
  };
}

export type BuyLine = {
  r: Requirement;
  part: BomPart | undefined;
  buy: number;
  cost: number | null;
  lineCost: number | null;
  priceSource: PriceSource | null;
  priceDate: string | null;
  urgency: Urgency;
  leadDays: number;
  leadAssumed: boolean;
  vendor: string;
};

export type PlanContext = {
  boms: Boms;
  parts: Record<string, BomPart>;
  /** Usable stock + open POs, per part. */
  supply: (part: string) => number;
  rowOf: Map<string, PlanRow>;
  /** Units to make for a product (its suggestion, an override, or 0). */
  makeFor: (r: PlanRow) => number;
  partSettings: Map<string, PartSetting>;
  vendorSettings: Map<string, VendorSetting>;
  buyOverride?: Map<string, number>;
};

/** The plan for one family: what's made, the netted requirements, the buys. */
export function planFamily(fam: Family, ctx: PlanContext) {
  const plan = new Map<string, number>();
  for (const part of fam.parts) {
    const r = ctx.rowOf.get(part);
    if (!r) continue;
    const m = ctx.makeFor(r);
    if (m > 0) plan.set(part, m);
  }
  const req = planRequirements(ctx.boms, plan, ctx.supply);
  const lines: BuyLine[] = [];
  for (const r of req.values()) {
    if (r.hasBom || r.needed <= 0) continue;
    const part = ctx.parts[r.part];
    const ps = ctx.partSettings.get(r.part);
    const vs = ctx.vendorSettings.get(vendorFor(part) ?? "");
    const buy = ctx.buyOverride?.get(r.part) ?? orderQty(r.short, part, ps, vs);
    if (buy <= 0) continue;
    const covers = r.usedBy.map((u) => ctx.rowOf.get(u)?.cover).filter((c): c is number => c != null);
    const u = orderUrgency({
      coverMonths: covers.length ? Math.min(...covers) : null,
      leadTimeDays: leadDaysFor(part, ps, vs),
      stockAnywhere: Object.values(part?.stockByLocation ?? {}).reduce((s, q) => s + Math.max(0, q), 0),
      onOrder: part?.onOrder ?? 0,
      madeToOrder: isFill(part),
    });
    const pr = priceFor(part, ps);
    lines.push({
      r,
      part,
      buy,
      cost: pr.price,
      lineCost: pr.price !== null ? pr.price * buy : null,
      priceSource: pr.source,
      priceDate: pr.date,
      ...u,
      vendor: vendorFor(part) ?? NO_VENDOR,
    });
  }
  return { plan, req, lines };
}

const URGENCY_RANK: Record<Urgency, number> = { now: 0, soon: 1, later: 2, check: 3 };

export type FamilySummary = {
  f: Family;
  atRisk: number;
  review: number;
  toMake: number;
  cost: number;
  now: number;
};

/** One line per family for the rail, most urgent first. */
export function rankFamilies(families: Family[], ctx: PlanContext): FamilySummary[] {
  return families
    .map((f) => {
      const { plan, lines } = planFamily(f, ctx);
      const ordering = lines.filter((l) => l.urgency !== "check");
      const statuses = f.parts.map((p) => ctx.rowOf.get(p)?.status);
      return {
        f,
        atRisk: statuses.filter((s) => s === "at risk").length,
        review: statuses.filter((s) => s === "needs review").length,
        toMake: plan.size,
        cost: ordering.reduce((s, l) => s + (l.lineCost ?? 0), 0),
        now: ordering.filter((l) => l.urgency === "now").length,
      };
    })
    .sort((a, b) => b.now - a.now || b.atRisk - a.atRisk || b.review - a.review || b.f.parts.length - a.f.parts.length);
}

export type VendorOrder = {
  vendor: string;
  items: BuyLine[];
  worst: Urgency;
  total: number;
  weeks: number;
  units: number;
  runMin: number | null;
  guessed: boolean;
};

/** The order list grouped per vendor (excluding "check first" lines), most urgent first. */
export function vendorOrders(lines: BuyLine[], vendorSettings: Map<string, VendorSetting>): VendorOrder[] {
  const g = new Map<string, BuyLine[]>();
  for (const l of lines) {
    if (l.urgency === "check") continue;
    g.set(l.vendor, [...(g.get(l.vendor) ?? []), l]);
  }
  return [...g.entries()]
    .map(([vendor, items]) => {
      items.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || (b.lineCost ?? 0) - (a.lineCost ?? 0));
      return {
        vendor,
        items,
        worst: items[0].urgency,
        total: items.reduce((s, i) => s + (i.lineCost ?? 0), 0),
        weeks: Math.ceil(Math.max(...items.map((i) => i.leadDays)) / 7),
        units: items.reduce((s, i) => s + i.buy, 0),
        runMin: vendorSettings.get(vendor)?.min_run_qty ?? null,
        guessed: items.some((i) => i.leadAssumed),
      };
    })
    .sort((a, b) => URGENCY_RANK[a.worst] - URGENCY_RANK[b.worst] || b.total - a.total);
}

export type KapraTransfer = { part: string; qty: number; from: string[] };

/** Ingredients the plan needs that are sitting somewhere other than Kapra. */
export function sendToKapra(req: Map<string, Requirement>, parts: Record<string, BomPart>): KapraTransfer[] {
  const out: KapraTransfer[] = [];
  for (const r of req.values()) {
    if (r.hasBom || r.needed <= 0) continue;
    const p = parts[r.part];
    const atKapra = p?.stockByLocation[FILLER_LOCATION] ?? 0;
    if (atKapra >= r.needed) continue;
    const away = awayFromFiller(p);
    const awayTotal = away.reduce((s, a) => s + a.qty, 0);
    if (awayTotal <= 0) continue;
    out.push({ part: r.part, qty: Math.min(awayTotal, r.needed - atKapra), from: away.map((a) => a.location) });
  }
  return out;
}
