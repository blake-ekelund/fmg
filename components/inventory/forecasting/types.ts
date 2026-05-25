import { Product } from "../types";

export type ForecastRow = Product & {
  on_hand: number;
  on_order: number;
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
