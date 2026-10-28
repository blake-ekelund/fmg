/**
 * Component planning over Fishbowl BOMs — pure functions, no I/O, so the rules
 * are testable and the Purchasing page can recompute instantly as someone
 * types quantities.
 *
 * Vocabulary:
 *  - supply(part): units usable right now (+ on order, + planned buys, as the
 *    caller chooses). The caller builds it; see usableStock().
 *  - buildable: finished units makeable from supply, drilling through
 *    sub-assemblies (a tester is made from a prelabeled tube that is itself on
 *    a BOM). Computed per product as if nothing else were made — it answers
 *    "what could this product become?", not "what can we make of everything at
 *    once" (that's planRequirements).
 *  - planRequirements: classic MRP netting. Planned make quantities explode
 *    level by level (low-level codes, so a shared component has collected ALL
 *    its demand before it is netted), sub-assemblies net against their own
 *    stock before exploding, and leaf components come out as a shortfall.
 *    Shared components are where the "double dip" shows: one buy covers every
 *    planned product that uses it.
 */

import type { BomPart, BomUniverse } from "./fishbowlBom";

export type Boms = BomUniverse["boms"];

/** Location groups whose stock can't feed production: Amazon FBA stock is
 *  committed to Amazon. Everything else (the fillers, FMG, Point B) counts. */
export const NON_PRODUCTION_LOCATIONS = new Set(["Amazon Warehouse"]);
export const POINT_B_LOCATION = "Point B Solutions";

/**
 * Units of a part usable for production. Point B's live AVAILABLE replaces
 * Fishbowl's Point B figure when given (Point B is the truth for what's on its
 * shelves); every other location comes from Fishbowl.
 */
export function usableStock(part: BomPart | undefined, pointbAvailable: number | null): number {
  if (!part) return Math.max(0, pointbAvailable ?? 0);
  let total = 0;
  for (const [loc, qty] of Object.entries(part.stockByLocation)) {
    if (NON_PRODUCTION_LOCATIONS.has(loc)) continue;
    if (loc === POINT_B_LOCATION && pointbAvailable !== null) continue;
    total += qty;
  }
  if (pointbAvailable !== null) total += pointbAvailable;
  return Math.max(0, total);
}

/** Component → the finished parts whose BOM lists it. */
export function whereUsed(boms: Boms): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [fg, bom] of Object.entries(boms)) {
    for (const l of bom.lines) {
      const list = out.get(l.component) ?? [];
      if (!list.includes(fg)) list.push(fg);
      out.set(l.component, list);
    }
  }
  for (const list of out.values()) list.sort();
  return out;
}

/** Guard against a malformed BOM that (directly or not) contains itself. */
const MAX_DEPTH = 12;

export type Buildable = {
  units: number;
  /** The component that runs out first, or null with no BOM / no lines. */
  bottleneck: string | null;
};

/**
 * How many units of `part` its BOM could produce from `supply`. Sub-assembly
 * components count their own stock plus what THEY could be built into.
 * A part with no BOM returns 0 units (it can't be built, only bought).
 */
export function buildable(
  part: string,
  boms: Boms,
  supply: (part: string) => number,
  memo: Map<string, Buildable> = new Map(),
  depth = 0,
): Buildable {
  const hit = memo.get(part);
  if (hit) return hit;
  const bom = boms[part];
  if (!bom || bom.lines.length === 0 || depth > MAX_DEPTH) return { units: 0, bottleneck: null };

  let units = Infinity;
  let bottleneck: string | null = null;
  for (const l of bom.lines) {
    if (l.qtyPer <= 0) continue;
    const sub = boms[l.component] ? buildable(l.component, boms, supply, memo, depth + 1).units : 0;
    const have = supply(l.component) + sub;
    const can = Math.floor(have / l.qtyPer + 1e-9);
    if (can < units) {
      units = can;
      bottleneck = l.component;
    }
  }
  const result = { units: units === Infinity ? 0 : Math.max(0, units), bottleneck };
  memo.set(part, result);
  return result;
}

/** Depth of each part below the finished goods that use it (0 = top). */
export function lowLevelCodes(boms: Boms): Map<string, number> {
  const llc = new Map<string, number>();
  const visit = (part: string, level: number, depth: number) => {
    if (depth > MAX_DEPTH) return;
    if ((llc.get(part) ?? -1) >= level) return;
    llc.set(part, level);
    for (const l of boms[part]?.lines ?? []) visit(l.component, level + 1, depth + 1);
  };
  for (const fg of Object.keys(boms)) visit(fg, 0, 0);
  return llc;
}

export type Requirement = {
  part: string;
  /** Units needed by planned production of the parts above it. */
  needed: number;
  /** Of `needed`, covered by supply. */
  fromSupply: number;
  /** Units to make (planned quantity, plus any sub-assembly shortfall). */
  make: number;
  /** Units still missing after supply — what to buy. Leaf parts only. */
  short: number;
  /** The PLANNED products this part ends up in. */
  usedBy: string[];
  hasBom: boolean;
};

/**
 * Net a production plan against supply, MRP-style.
 *
 * `plan` is units to make per part. A planned part is made in full (it's a
 * decision, not a demand to net), plus whatever extra its parents need beyond
 * its stock. Everything below is netted: a sub-assembly uses its stock first
 * and only the remainder is made; a leaf component's remainder is a shortfall.
 */
export function planRequirements(
  boms: Boms,
  plan: Map<string, number>,
  supply: (part: string) => number,
): Map<string, Requirement> {
  const llc = lowLevelCodes(boms);
  const needed = new Map<string, number>();
  const usedBy = new Map<string, Set<string>>();
  const out = new Map<string, Requirement>();

  const touched = new Set<string>([...plan.keys()].filter((p) => (plan.get(p) ?? 0) > 0));
  // Walk levels top-down; a part is only processed once every parent has
  // pushed its demand into it.
  const levels = new Map<number, string[]>();
  const levelOf = (p: string) => llc.get(p) ?? 0;
  const enqueue = (p: string) => {
    const lv = levelOf(p);
    const list = levels.get(lv) ?? [];
    if (!list.includes(p)) list.push(p);
    levels.set(lv, list);
  };
  for (const p of touched) enqueue(p);

  for (let lv = 0; lv <= MAX_DEPTH + 1; lv++) {
    for (const part of levels.get(lv) ?? []) {
      const planned = Math.max(0, plan.get(part) ?? 0);
      const need = needed.get(part) ?? 0;
      const have = Math.max(0, supply(part));
      const fromSupply = Math.min(need, have);
      const gap = need - fromSupply;
      const bom = boms[part];
      const hasBom = !!bom && bom.lines.length > 0;
      const make = hasBom ? planned + gap : planned;
      const short = hasBom ? 0 : gap;
      const users = usedBy.get(part) ?? new Set<string>();
      if (planned > 0) users.add(part);

      out.set(part, {
        part,
        needed: need,
        fromSupply,
        make,
        short,
        usedBy: [...users].sort(),
        hasBom,
      });

      if (hasBom && make > 0) {
        for (const l of bom.lines) {
          needed.set(l.component, (needed.get(l.component) ?? 0) + make * l.qtyPer);
          const childUsers = usedBy.get(l.component) ?? new Set<string>();
          for (const u of users) childUsers.add(u);
          usedBy.set(l.component, childUsers);
          enqueue(l.component);
        }
      }
    }
  }
  return out;
}

/** Round a buy up to the vendor minimum, never below the shortfall. */
export function suggestedBuy(short: number, moq: number | null): number {
  if (short <= 0) return 0;
  const units = Math.ceil(short - 1e-9);
  return moq && moq > units ? moq : units;
}

/** The cost to quote: the most recent PO price, else the vendor's last price,
 *  else Fishbowl's average cost. (A price someone typed wins — see priceFor.) */
export function unitCost(part: BomPart | undefined): number | null {
  if (!part) return null;
  if (part.lastPoCost && part.lastPoCost > 0) return part.lastPoCost;
  return part.lastCost && part.lastCost > 0 ? part.lastCost : part.avgCost;
}

/** Material cost of one finished unit, rolled up through sub-assemblies. */
export function materialCost(
  part: string,
  boms: Boms,
  parts: Record<string, BomPart>,
  depth = 0,
): { cost: number; missing: string[] } {
  const bom = boms[part];
  if (!bom || depth > MAX_DEPTH) return { cost: 0, missing: [] };
  let cost = 0;
  const missing: string[] = [];
  for (const l of bom.lines) {
    if (boms[l.component]) {
      const sub = materialCost(l.component, boms, parts, depth + 1);
      cost += sub.cost * l.qtyPer;
      missing.push(...sub.missing);
    } else {
      const c = unitCost(parts[l.component]);
      if (c === null) missing.push(l.component);
      else cost += c * l.qtyPer;
    }
  }
  return { cost, missing };
}

/* ─── Founder view: how urgent is a buy? ─────────────────────────────────── */

/** Where every product is filled (Blake, 2026-10-28: "Kapra has all filler"). */
export const FILLER_LOCATION = "Kapra Cosmetics";

/** Used when Fishbowl has no lead time for the vendor part. */
export const DEFAULT_LEAD_DAYS = 56;
/** Time for Kapra to fill and the goods to reach Point B, on top of the lead time. */
export const PRODUCTION_DAYS = 14;

export type Urgency = "check" | "now" | "soon" | "later";

/**
 * When a buy has to be placed. A component is needed before the products it
 * goes into run out, and it takes (lead time + filling time) to turn into
 * product. So: months of cover left on the most-urgent product using it, minus
 * that time. Under half a month of slack → order now; under two → soon.
 *
 * "check" comes first and overrides the rest: no stock recorded ANYWHERE and
 * nothing on order usually means Fishbowl isn't counting the part (shippers,
 * some labels), not that it's truly gone — a human should look before buying.
 */
export function orderUrgency(opts: {
  /** Months of cover on the most-urgent product that uses it (null = no demand). */
  coverMonths: number | null;
  leadTimeDays: number | null;
  stockAnywhere: number;
  onOrder: number;
  /** Fill and other made-to-order parts: zero stock is normal, never "check". */
  madeToOrder?: boolean;
}): { urgency: Urgency; slackMonths: number | null; leadDays: number; leadAssumed: boolean } {
  const leadAssumed = !opts.leadTimeDays || opts.leadTimeDays <= 0;
  const leadDays = leadAssumed ? DEFAULT_LEAD_DAYS : (opts.leadTimeDays as number);
  if (!opts.madeToOrder && opts.stockAnywhere <= 0 && opts.onOrder <= 0) {
    return { urgency: "check", slackMonths: null, leadDays, leadAssumed };
  }
  if (opts.coverMonths === null) return { urgency: "later", slackMonths: null, leadDays, leadAssumed };
  const slack = opts.coverMonths - (leadDays + PRODUCTION_DAYS) / 30;
  const urgency: Urgency = slack < 0.5 ? "now" : slack < 2 ? "soon" : "later";
  return { urgency, slackMonths: slack, leadDays, leadAssumed };
}

/** Units of a part held somewhere other than the filler (and not Amazon). */
export function awayFromFiller(part: BomPart | undefined): { location: string; qty: number }[] {
  if (!part) return [];
  return Object.entries(part.stockByLocation)
    .filter(([loc, q]) => q > 0 && loc !== FILLER_LOCATION && !NON_PRODUCTION_LOCATIONS.has(loc) && loc !== POINT_B_LOCATION)
    .map(([location, qty]) => ({ location, qty }));
}

/**
 * Fill ("goop") is made and held by Kapra and bought from them with each
 * production run (every fill PO since 2025 went to Kapra), so it normally
 * shows zero stock in Fishbowl. Zero is expected for these — not a sign the
 * part isn't being counted.
 */
export function isFill(part: BomPart | undefined): boolean {
  return !!part && /\bfill\b/i.test(part.description);
}

/** Who to order from: Fishbowl's default vendor, else Kapra for fill. */
export function vendorFor(part: BomPart | undefined): string | null {
  if (part?.vendor) return part.vendor;
  return isFill(part) ? FILLER_LOCATION : null;
}

/* ─── SKU families ─────────────────────────────────────────────────────────── */

/**
 * Packaging that sits on many unrelated BOMs (shippers, the "TRY ME" tester
 * label, inserts, bags). Linking on it would chain every product into one
 * family, so it never connects products — real ingredients (bottle, tube, pump,
 * fill, label) do.
 */
export const PACKAGING = /^(SHIPPER|LABEL Tester|INSERT|BOX\b|BAG\b|CASE\b|TAPE\b)/i;

export type Family = {
  id: string;
  /** Product lines in the family, most products first ("Mini Hand Creme"). */
  lines: string[];
  parts: string[];
};

/**
 * Group products that should be planned together: ones that share a real
 * ingredient anywhere down their recipe, or belong to the same product line
 * (so a tester sits with its parent even when they share nothing but the line).
 *
 * `products` are the plannable products with their line name (display name
 * minus any "TESTER" prefix). Union-find over both kinds of link.
 */
export function bomFamilies(
  boms: Boms,
  parts: Record<string, BomPart>,
  products: { part: string; line: string }[],
): Family[] {
  const plannable = new Set(products.map((p) => p.part));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c) as string;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of plannable) parent.set(p, p);

  // Ingredients reached through sub-assemblies that aren't products themselves.
  const ingredients = (p: string, depth = 0): string[] => {
    if (depth > MAX_DEPTH) return [];
    return (boms[p]?.lines ?? []).flatMap((l) =>
      boms[l.component] && !plannable.has(l.component) ? ingredients(l.component, depth + 1) : [l.component],
    );
  };

  const firstUser = new Map<string, string>();
  for (const p of plannable) {
    for (const c of new Set(ingredients(p))) {
      if (plannable.has(c)) {
        union(p, c); // a product made from another product (tester, kit)
        continue;
      }
      if (PACKAGING.test(parts[c]?.description ?? "")) continue;
      const first = firstUser.get(c);
      if (first) union(p, first);
      else firstUser.set(c, p);
    }
  }
  const byLine = new Map<string, string>();
  for (const { part, line } of products) {
    const key = line.trim().toLowerCase();
    if (!key) continue;
    const first = byLine.get(key);
    if (first) union(part, first);
    else byLine.set(key, part);
  }

  const groups = new Map<string, string[]>();
  for (const p of plannable) {
    const r = find(p);
    groups.set(r, [...(groups.get(r) ?? []), p]);
  }
  const lineOf = new Map(products.map((p) => [p.part, p.line.trim()]));
  return [...groups.values()].map((members) => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const l = lineOf.get(m) || m;
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    const lines = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
    const sorted = members.sort();
    return { id: sorted[0], lines, parts: sorted };
  });
}

/* ─── Ordering rules set on the page (purchasing_*_settings) ──────────────── */

export type PartSetting = {
  part: string;
  min_qty: number | null;
  multiple: number | null;
  unit_price: number | null;
  lead_days: number | null;
  note: string | null;
};

export type VendorSetting = {
  vendor: string;
  min_run_qty: number | null;
  item_min_qty: number | null;
  lead_days: number | null;
  note: string | null;
};

export type PriceSource = "you" | "last PO" | "vendor" | "average";

/** Which price to use, and where it came from — a typed price always wins. */
export function priceFor(
  part: BomPart | undefined,
  setting?: PartSetting,
): { price: number | null; source: PriceSource | null; date: string | null } {
  if (setting?.unit_price != null && setting.unit_price > 0) return { price: setting.unit_price, source: "you", date: null };
  if (part?.lastPoCost && part.lastPoCost > 0) return { price: part.lastPoCost, source: "last PO", date: part.lastPoDate };
  if (part?.lastCost && part.lastCost > 0) return { price: part.lastCost, source: "vendor", date: null };
  if (part?.avgCost && part.avgCost > 0) return { price: part.avgCost, source: "average", date: null };
  return { price: null, source: null, date: null };
}

/** Lead time: the ingredient's own setting, else the vendor's, else Fishbowl's. */
export function leadDaysFor(part: BomPart | undefined, p?: PartSetting, v?: VendorSetting): number | null {
  return p?.lead_days ?? v?.lead_days ?? part?.leadTimeDays ?? null;
}

/**
 * How much to order for a shortfall: at least the ingredient's minimum (else
 * the vendor's "each item at least", else Fishbowl's vendor minimum), rounded
 * up to its multiple. Nothing short → nothing ordered.
 */
export function orderQty(
  short: number,
  part: BomPart | undefined,
  p?: PartSetting,
  v?: VendorSetting,
): number {
  if (short <= 0) return 0;
  const min = p?.min_qty ?? v?.item_min_qty ?? part?.moq ?? null;
  let qty = Math.max(Math.ceil(short - 1e-9), min && min > 0 ? min : 0);
  const mult = p?.multiple;
  if (mult && mult > 0) qty = Math.ceil(qty / mult - 1e-9) * mult;
  return qty;
}

/**
 * Spread the units a vendor's run is missing across its items, in proportion
 * to how much each item needs, rounding each up to its multiple. Returns the
 * EXTRA units per part; the new total always reaches `minRun`.
 *
 * This is the "Kapra makes at least X per run, split across fragrances" rule.
 */
export function topUpToRun(
  items: { part: string; buy: number; weight: number; multiple?: number | null }[],
  minRun: number,
): Map<string, number> {
  const extra = new Map<string, number>();
  const total = items.reduce((s, i) => s + i.buy, 0);
  let missing = Math.ceil(minRun - total - 1e-9);
  if (missing <= 0 || items.length === 0) return extra;
  const weightSum = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  const share = (i: (typeof items)[number]) =>
    weightSum > 0 ? Math.max(0, i.weight) / weightSum : 1 / items.length;

  for (const i of items) {
    let add = Math.ceil(missing * share(i) - 1e-9);
    if (i.multiple && i.multiple > 0) add = Math.ceil(add / i.multiple - 1e-9) * i.multiple;
    if (add > 0) extra.set(i.part, add);
  }
  // Rounding up can only overshoot, but guard the total anyway.
  const added = [...extra.values()].reduce((s, n) => s + n, 0);
  missing = Math.ceil(minRun - total - added - 1e-9);
  if (missing > 0) {
    const top = [...items].sort((a, b) => b.weight - a.weight)[0];
    extra.set(top.part, (extra.get(top.part) ?? 0) + missing);
  }
  return extra;
}
