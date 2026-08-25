/**
 * Compare what Fishbowl thinks we hold against what Point B's Synapse WMS
 * actually holds — pure functions, no I/O, so the reconciliation rules are
 * testable without either system.
 *
 * The two numbers are genuinely comparable: Fishbowl's inventory query is
 * scoped to locationGroupId 1 (the Point B location group, see
 * lib/fishbowlQueries.ts) and Synapse returns only facility PB1. Neither side
 * is summing a warehouse the other can't see.
 *
 * Point B is the source of truth for what is physically on a shelf — it is the
 * building. A variance is therefore a statement about Fishbowl being wrong, or
 * about paperwork in flight, never about Synapse miscounting.
 */

import type { SynapseItemStock } from "./pointb";

/** The Fishbowl side, as `inventory_snapshot_items` stores it. */
export type FishbowlStock = {
  part: string;
  description?: string | null;
  uom?: string | null;
  on_hand: number;
  available?: number | null;
  allocated?: number | null;
};

/** Why a line can't be compared straight across, or is worth a human look. */
export type VarianceFlag =
  /** In Fishbowl's snapshot, absent from Synapse entirely. */
  | "missing-in-synapse"
  /** On a Point B shelf but not in the Fishbowl snapshot — nothing to sell it against. */
  | "missing-in-fishbowl"
  /** Synapse holds this item in more than one unit of measure (e.g. EA and CS),
   *  so its quantities do not add up to a single comparable number. */
  | "mixed-uom"
  /** Synapse is holding stock back (QC Hold / Suspense) that Fishbowl counts as on hand. */
  | "held-stock";

export type VarianceRow = {
  part: string;
  description: string;
  /** Fishbowl on-hand, or null when the part isn't in the snapshot. */
  fishbowl: number | null;
  /** Synapse physical stock (commitments NOT netted out), or null when absent. */
  synapse: number | null;
  /** synapse - fishbowl. Positive = Point B holds more than Fishbowl believes. */
  variance: number | null;
  /** Variance as a share of the Fishbowl figure, or null when Fishbowl is 0. */
  variancePct: number | null;
  /** Absolute variance, for ranking. */
  magnitude: number;
  synapseAvailable: number | null;
  synapseHeld: number | null;
  synapseCommitted: number | null;
  fishbowlAvailable: number | null;
  flags: VarianceFlag[];
};

export type VarianceSummary = {
  /** Parts present in both systems. */
  compared: number;
  /** Of those, how many agree exactly. */
  inAgreement: number;
  /** Parts whose counts differ. */
  differing: number;
  missingInSynapse: number;
  missingInFishbowl: number;
  /** Sum of |variance| over comparable lines — one number for "how far apart". */
  totalAbsVariance: number;
  fishbowlTotal: number;
  synapseTotal: number;
  flagged: number;
};

const norm = (part: string): string => part.trim().toUpperCase();

/**
 * Build one row per part across the union of both systems.
 *
 * `on_hand` is the Fishbowl side of the comparison rather than `available`,
 * because it's the physical count — and it's matched against Synapse's
 * `physical` (commitments excluded) for the same reason. Netting one side and
 * not the other is the easiest way to manufacture a variance that isn't real.
 *
 * A part missing from one side is reported, never coerced to 0: "Fishbowl has
 * no row for this" and "Fishbowl says zero" are different facts, and only the
 * second is a discrepancy in the count.
 */
export function buildVarianceRows(
  fishbowl: FishbowlStock[],
  synapse: Map<string, SynapseItemStock>,
): VarianceRow[] {
  const fbByPart = new Map<string, FishbowlStock>();
  for (const f of fishbowl) {
    const key = norm(f.part);
    if (!key) continue;
    // Defensive: a snapshot should hold one row per part, but if it ever holds
    // two, add them rather than letting the last one win.
    const prev = fbByPart.get(key);
    if (prev) prev.on_hand += f.on_hand;
    else fbByPart.set(key, { ...f, part: key });
  }

  const synByPart = new Map<string, SynapseItemStock>();
  for (const [item, stock] of synapse) {
    const key = norm(item);
    if (key) synByPart.set(key, stock);
  }

  const parts = [...new Set([...fbByPart.keys(), ...synByPart.keys()])].sort();
  const rows: VarianceRow[] = [];

  for (const part of parts) {
    const fb = fbByPart.get(part);
    const sy = synByPart.get(part);
    const flags: VarianceFlag[] = [];

    if (fb && !sy) flags.push("missing-in-synapse");
    if (!fb && sy) flags.push("missing-in-fishbowl");
    if (sy && sy.uoms.length > 1) flags.push("mixed-uom");
    if (sy && sy.held > 0) flags.push("held-stock");

    const fishbowlQty = fb ? fb.on_hand : null;
    const synapseQty = sy ? sy.physical : null;
    // Only a part both systems know about has a meaningful variance. A mixed-UOM
    // line has no single comparable quantity, so it gets no number either.
    const comparable =
      fishbowlQty !== null && synapseQty !== null && !flags.includes("mixed-uom");
    const variance = comparable ? synapseQty - fishbowlQty : null;

    rows.push({
      part,
      description: fb?.description?.trim() || "",
      fishbowl: fishbowlQty,
      synapse: synapseQty,
      variance,
      variancePct:
        variance !== null && fishbowlQty ? (variance / Math.abs(fishbowlQty)) * 100 : null,
      magnitude: variance === null ? 0 : Math.abs(variance),
      synapseAvailable: sy ? sy.available : null,
      synapseHeld: sy ? sy.held : null,
      synapseCommitted: sy ? sy.committed : null,
      fishbowlAvailable: fb?.available ?? null,
      flags,
    });
  }

  return rows;
}

/** Biggest disagreements first — that's the only order worth opening this in. */
export function sortByMagnitude(rows: VarianceRow[]): VarianceRow[] {
  return [...rows].sort((a, b) => {
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
    // Unmatched parts carry no magnitude, so surface them above the quiet
    // in-agreement lines rather than burying them at the bottom.
    const rank = (r: VarianceRow) => (r.flags.length ? 1 : 0);
    if (rank(b) !== rank(a)) return rank(b) - rank(a);
    return a.part.localeCompare(b.part);
  });
}

export function summarize(rows: VarianceRow[]): VarianceSummary {
  let compared = 0;
  let inAgreement = 0;
  let differing = 0;
  let missingInSynapse = 0;
  let missingInFishbowl = 0;
  let totalAbsVariance = 0;
  let fishbowlTotal = 0;
  let synapseTotal = 0;
  let flagged = 0;

  for (const r of rows) {
    if (r.flags.includes("missing-in-synapse")) missingInSynapse++;
    if (r.flags.includes("missing-in-fishbowl")) missingInFishbowl++;
    if (r.flags.length) flagged++;
    if (r.fishbowl !== null) fishbowlTotal += r.fishbowl;
    if (r.synapse !== null) synapseTotal += r.synapse;
    if (r.variance !== null) {
      compared++;
      totalAbsVariance += Math.abs(r.variance);
      if (r.variance === 0) inAgreement++;
      else differing++;
    }
  }

  return {
    compared,
    inAgreement,
    differing,
    missingInSynapse,
    missingInFishbowl,
    totalAbsVariance,
    fishbowlTotal,
    synapseTotal,
    flagged,
  };
}
