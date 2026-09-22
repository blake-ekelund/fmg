/**
 * Hold an order back from Fishbowl when Point B can't fill it.
 *
 * WHY. Ops was already doing this by hand, after the fact. Reading the last 49
 * marketplace SOs we pushed against live Synapse stock (2026-09-22): SO 24817
 * lost its `160-00-02` line entirely — Point B has 0 — and its `160-00-04`
 * line was cut from 6 to 2, which is exactly the 2 on the shelf. SO 24872 lost
 * `140-00-06`, `140-01-06` and the `511-06-99` display, all at 0. Every one of
 * those was a person opening the SO and deleting what we had just imported.
 *
 * Point B is the source of truth for what is physically on a shelf (see
 * lib/inventoryVariance.ts) — Fishbowl's own on-hand drifts, so the check runs
 * against Synapse, not against Fishbowl.
 *
 * WHAT IT WILL NOT DO. It only blocks on stock it can actually vouch for. A
 * part Synapse has never heard of, or one counted in cases while the order is
 * in eaches, produces a WARNING and the push continues — refusing an order on
 * the strength of a number we don't understand would be worse than the problem.
 * Blocking is reserved for "this part is in the building and there isn't
 * enough of it".
 *
 * Pure functions here; the Synapse fetch + cache lives in lib/fishbowlEstimatePush.ts.
 */

import type { SynapseItemStock } from "./pointb";

export type StockIssueKind =
  /** Point B holds fewer than the order needs. Blocks the push. */
  | "short"
  /** Point B holds none at all. Blocks the push. */
  | "out"
  /** The part is not in Synapse's item list — nothing to compare. Warns. */
  | "unknown-part"
  /** Synapse counts this part in a unit the order isn't in (CS vs EA). Warns. */
  | "uom-mismatch";

export type StockIssue = {
  part: string;
  kind: StockIssueKind;
  /** Quantity the estimate would consume, kits already expanded. */
  ordered: number;
  /** Synapse available (inventory_status AV), or null when unknown. */
  available: number | null;
  /** ordered − available, when both are known. */
  short: number | null;
  /** Non-EA units Synapse counts this part in, for a uom-mismatch. */
  uoms?: string[];
  /** True when this issue stops the push. */
  blocking: boolean;
};

export type StockCheck = {
  /** Every issue found, blocking first, then by biggest shortfall. */
  issues: StockIssue[];
  /** The blocking subset — non-empty means "do not push". */
  blocking: StockIssue[];
  /** Lines checked against a real Synapse figure. */
  verified: number;
  /** When the Synapse snapshot was taken. */
  checkedAt: string;
};

/** The unit an estimate's quantities are in. Everything we import is eaches. */
const ORDER_UOM = "EA";

/**
 * Compare the parts an estimate will consume against a Synapse rollup.
 *
 * `stock` is keyed by part number — `rollUpSynapseInventory()` from
 * lib/pointb.ts, whose `available` is the AV (sellable) quantity with
 * commitments already netted out, which is the right number to promise against.
 */
export function checkStock(
  lines: ReadonlyArray<{ part: string; quantity: number }>,
  stock: ReadonlyMap<string, SynapseItemStock>,
  opts: { checkedAt?: string } = {},
): StockCheck {
  const issues: StockIssue[] = [];
  let verified = 0;

  for (const line of lines) {
    const part = line.part.trim();
    const ordered = Number(line.quantity) || 0;
    if (!part || ordered <= 0) continue;

    const held = stock.get(part);
    if (!held) {
      issues.push({ part, kind: "unknown-part", ordered, available: null, short: null, blocking: false });
      continue;
    }

    // Mixed or non-EA units mean the two numbers are not the same kind of
    // thing. lib/inventoryVariance.ts draws the same line; 7 of the 411 items
    // Point B holds are in cases.
    const foreignUoms = held.uoms.filter((u) => u.trim().toUpperCase() !== ORDER_UOM);
    if (foreignUoms.length > 0) {
      issues.push({
        part,
        kind: "uom-mismatch",
        ordered,
        available: held.available,
        short: null,
        uoms: held.uoms,
        blocking: false,
      });
      continue;
    }

    verified++;
    if (held.available >= ordered) continue;
    issues.push({
      part,
      kind: held.available <= 0 ? "out" : "short",
      ordered,
      available: held.available,
      short: ordered - held.available,
      blocking: true,
    });
  }

  const rank = (i: StockIssue) => (i.blocking ? 0 : 1);
  issues.sort((a, b) => rank(a) - rank(b) || (b.short ?? 0) - (a.short ?? 0) || a.part.localeCompare(b.part));

  return {
    issues,
    blocking: issues.filter((i) => i.blocking),
    verified,
    checkedAt: opts.checkedAt ?? new Date().toISOString(),
  };
}

/** One issue, in the words a human reading the Orders page needs. */
export function describeStockIssue(issue: StockIssue): string {
  switch (issue.kind) {
    case "out":
      return `${issue.part}: ordered ${issue.ordered}, Point B has none`;
    case "short":
      return `${issue.part}: ordered ${issue.ordered}, Point B has ${issue.available} (short ${issue.short})`;
    case "unknown-part":
      return `${issue.part}: not an item at Point B — stock not checked`;
    case "uom-mismatch":
      return `${issue.part}: Point B counts this in ${(issue.uoms ?? []).join("/")}, not each — stock not checked`;
  }
}

/**
 * The message the push fails with. It names every short line, because the
 * person reading it has to decide whether to wait for stock, cut the order, or
 * override — and one line at a time would make that three trips.
 */
export function stockHoldMessage(check: StockCheck): string {
  const lines = check.blocking.map((i) => `  • ${describeStockIssue(i)}`).join("\n");
  return `Not pushed — Point B doesn't have the stock for ${check.blocking.length} line${
    check.blocking.length === 1 ? "" : "s"
  }:\n${lines}`;
}
