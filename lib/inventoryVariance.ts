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

/** A person's standing decision about one part — see the migration. */
export type VarianceOverride = {
  part: string;
  archived: boolean;
  /** The unit Fishbowl's quantity is really in, when its own label is wrong. */
  uom_override?: string | null;
  note?: string | null;
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
  /** The two systems count this part in DIFFERENT units — Fishbowl in eaches,
   *  Synapse in cases. The numbers are both right and not comparable. */
  | "uom-mismatch"
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
  /** The unit each side counts in, shown so a mismatch is legible rather than
   *  just asserted. Normalized to upper case. */
  fishbowlUom: string | null;
  synapseUom: string | null;
  /** True when someone has archived this part — excluded from every count and
   *  total, and hidden unless the reader asks to see archived lines. */
  archived: boolean;
  /** Set when fishbowlUom came from an override rather than from Fishbowl. */
  uomOverridden: boolean;
  note: string | null;
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
  /** Parts the two systems count in different units — excluded from every
   *  variance figure above, because their quantities aren't comparable. */
  uomMismatch: number;
  /** Parts a person has archived — excluded from every figure above. */
  archived: number;
  /** Sum of |variance| over comparable lines — one number for "how far apart". */
  totalAbsVariance: number;
  fishbowlTotal: number;
  synapseTotal: number;
  flagged: number;
};

const norm = (part: string): string => part.trim().toUpperCase();

/**
 * Do the two systems count this part in the same unit?
 *
 * Fishbowl writes "ea" / "bx"; Synapse writes "EA" / "CS" — so the comparison
 * is case-insensitive, but nothing beyond that. It is tempting to treat "bx"
 * (box) and "CS" (case) as the same thing; they are not reliably the same, and
 * quietly equating them would reintroduce exactly the silent wrong number this
 * flag exists to catch. Anything that isn't a plain match is a mismatch for a
 * human to resolve.
 *
 * A blank unit on either side is NOT a mismatch — it's an absence of
 * information, and flagging it would bury the real cases in noise.
 */
function unitsAgree(fishbowlUom: string | null, synapseUoms: string[]): boolean {
  if (!fishbowlUom || synapseUoms.length === 0) return true;
  return synapseUoms.every((u) => u === fishbowlUom);
}

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
  overrides: VarianceOverride[] = [],
): VarianceRow[] {
  const overrideByPart = new Map<string, VarianceOverride>();
  for (const o of overrides) {
    const key = norm(o.part);
    if (key) overrideByPart.set(key, o);
  }
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

    const ov = overrideByPart.get(part);
    // An override replaces Fishbowl's label BEFORE the units are compared, so
    // correcting a bad label clears the mismatch and lets the line compare.
    const overrideUom = ov?.uom_override?.trim().toUpperCase() || null;
    const fishbowlUom = overrideUom ?? (fb?.uom?.trim().toUpperCase() || null);
    const synapseUoms = sy ? sy.uoms.map((u) => u.trim().toUpperCase()) : [];

    if (fb && !sy) flags.push("missing-in-synapse");
    if (!fb && sy) flags.push("missing-in-fishbowl");
    if (sy && sy.uoms.length > 1) flags.push("mixed-uom");
    // Only meaningful when both sides are present — a part in one system alone
    // is already flagged, and adding a unit complaint on top is just noise.
    if (fb && sy && !unitsAgree(fishbowlUom, synapseUoms)) flags.push("uom-mismatch");
    if (sy && sy.held > 0) flags.push("held-stock");

    const fishbowlQty = fb ? fb.on_hand : null;
    const synapseQty = sy ? sy.physical : null;
    // Only a part both systems know about has a meaningful variance — and only
    // when both count it the same way. Subtracting cases from eaches produces a
    // confident, enormous, entirely fictional number (23,400 ea vs 24 CS reads
    // as a 23,376-unit hole), which also inflates the totals, so those lines get
    // no variance rather than a wrong one.
    const comparable =
      fishbowlQty !== null &&
      synapseQty !== null &&
      !flags.includes("mixed-uom") &&
      !flags.includes("uom-mismatch");
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
      fishbowlUom,
      synapseUom: synapseUoms.length ? synapseUoms.join("+") : null,
      archived: ov?.archived === true,
      uomOverridden: overrideUom !== null,
      note: ov?.note?.trim() || null,
      flags,
    });
  }

  return rows;
}

/** Biggest disagreements first — that's the only order worth opening this in. */
export function sortByMagnitude(rows: VarianceRow[]): VarianceRow[] {
  return [...rows].sort((a, b) => {
    // Archived lines sink below everything live, whatever their numbers say.
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
    // Unmatched parts carry no magnitude, so surface them above the quiet
    // in-agreement lines rather than burying them at the bottom.
    const rank = (r: VarianceRow) => (r.flags.length ? 1 : 0);
    if (rank(b) !== rank(a)) return rank(b) - rank(a);
    return a.part.localeCompare(b.part);
  });
}

/**
 * Roll the rows up.
 *
 * Archived parts are excluded from EVERY figure, not just hidden in the table —
 * archiving is someone saying "this line is settled", and a settled line that
 * still inflates the headline gap would make the whole exercise pointless. They
 * are counted on their own so the exclusion is visible rather than silent.
 */
export function summarize(rows: VarianceRow[]): VarianceSummary {
  let compared = 0;
  let inAgreement = 0;
  let differing = 0;
  let missingInSynapse = 0;
  let missingInFishbowl = 0;
  let uomMismatch = 0;
  let totalAbsVariance = 0;
  let fishbowlTotal = 0;
  let synapseTotal = 0;
  let flagged = 0;
  let archived = 0;

  for (const r of rows) {
    if (r.archived) {
      archived++;
      continue;
    }
    if (r.flags.includes("missing-in-synapse")) missingInSynapse++;
    if (r.flags.includes("missing-in-fishbowl")) missingInFishbowl++;
    if (r.flags.includes("uom-mismatch")) uomMismatch++;
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
    uomMismatch,
    archived,
    totalAbsVariance,
    fishbowlTotal,
    synapseTotal,
    flagged,
  };
}
