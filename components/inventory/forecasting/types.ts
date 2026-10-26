import { Product } from "../types";

/** Where a row's forecast on-hand came from. Point B is the building, so its
 *  count is the source of truth. "fishbowl" means Point B had no comparable
 *  number for the part (not stocked there, counted in a different unit, or the
 *  live read failed) and the Fishbowl snapshot stood in. "pending" means Point
 *  B hasn't answered yet. */
export type OnHandSource = "pointb" | "fishbowl" | "pending";

export type ForecastRow = Product & {
  /** The on-hand the forecast runs on: Point B when it has a comparable count,
   *  otherwise Fishbowl. See on_hand_source. */
  on_hand: number;
  on_order: number;
  /* The fields below are optional so other call sites that build a ForecastRow
     for projections alone (the product page) still type-check. */
  on_hand_source?: OnHandSource;
  /** Fishbowl snapshot on-hand, or null when the part isn't in the snapshot. */
  fishbowl_on_hand?: number | null;
  /** Point B (Synapse) AVAILABLE — physical minus held, committed and picked — or null
   *  when it has no row / no read. This is what the forecast runs on. */
  pointb_on_hand?: number | null;
  /** The pieces behind pointb_on_hand, for the tooltip. Physical is what the
   *  variance compares against Fishbowl. */
  pointb_physical?: number | null;
  pointb_held?: number;
  pointb_committed?: number;
  pointb_picked?: number;
  /** Point B − Fishbowl, null when the two aren't comparable (a missing side or
   *  different units) — the same rule as the variance report. */
  variance?: number | null;
  /** Why a line isn't comparable, when it isn't — shown as a tooltip. */
  variance_note?: string | null;
  snapshot_id: string;
  /** True when avg_monthly_demand was derived from sales-last-90-days, not
   *  a manual override saved on the product row. Cleared on user edit.
   *  Optional so legacy call sites that build ForecastRow shapes still type-check. */
  is_auto_avg?: boolean;
};

export type Period = { label: string; index: number };
export type ViewMode = "monthly" | "quarterly";

export type SortKey =
  | "status"
  | "part"
  | "display_name"
  | "fragrance"
  | "on_hand"
  | "fishbowl_on_hand"
  | "variance"
  | "on_order"
  | "avg_monthly_demand";
export type SortDir = "asc" | "desc";

export type InventoryStatus =
  | "healthy"
  | "needs review"
  | "at risk"
  | "no demand";

export function getInventoryStatus(
  onHand: number,
  onOrder: number,
  avg: number,
): InventoryStatus {
  if (avg <= 0) return "no demand";
  const mos = (onHand + onOrder) / avg;
  if (mos > 3) return "healthy";
  if (mos > 1.5) return "needs review";
  return "at risk";
}

export const STATUS_RANK: Record<InventoryStatus, number> = {
  "at risk": 0,
  "needs review": 1,
  healthy: 2,
  "no demand": 3,
};
