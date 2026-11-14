/**
 * Shared inventory-health definitions.
 *
 * The dashboard's "review overstock / understock" asks and the inventory
 * page's filters have to agree on what those words mean, so the thresholds and
 * predicates live here rather than being re-derived (and drifting) in each.
 */

import { demandAhead, monthsOfCover, type DemandProfile } from "@/lib/seasonalDemand";

/** Stock we want covered by on-hand + inbound POs before a SKU reads as short. */
export const COVERAGE_MONTHS = 3;

/**
 * Overstock is deliberately *not* just "a lot of months of supply". A staple
 * made in big batches (lip butter selling 200/mo) carries a year-plus of stock
 * as its normal state — that's batch economics, not stuck cash. What actually
 * needs a founder is deep stock on something that barely sells: those are the
 * positions that will hit shelf-life before they sell through. So overstock =
 * deep supply AND low velocity.
 */
export const OVERSTOCK_MIN_MONTHS = 24;
export const OVERSTOCK_MAX_MONTHLY_DEMAND = 25;

/** Fixtures, testers and display units aren't sellable stock — they'd otherwise
 *  top the overstock list (a tester carries years of "supply") and drown the
 *  real slow movers. */
export function isNonRetailFixture(name: string | null | undefined): boolean {
  return /tester|display|header|ladder|tray|\bbase\b/i.test(name ?? "");
}

export function monthsOfSupply(
  onHand: number,
  onOrder: number,
  avgMonthlyDemand: number,
): number {
  if (avgMonthlyDemand <= 0) return Infinity;
  return (onHand + onOrder) / avgMonthlyDemand;
}

type StockShape = {
  on_hand: number;
  on_order: number;
  avg_monthly_demand: number;
  display_name?: string | null;
  /** Month-by-month demand (lib/seasonalDemand). When present, cover walks the
   *  coming months' forecast and velocity is its 12-month average. */
  demand?: DemandProfile;
};

/** Months the stock (on hand + on order) lasts — seasonal when a profile is given. */
export function coverMonths(it: StockShape): number {
  return it.demand
    ? monthsOfCover(it.on_hand + it.on_order, it.demand)
    : monthsOfSupply(it.on_hand, it.on_order, it.avg_monthly_demand);
}

const velocity = (it: StockShape) => (it.demand ? it.demand.avg : it.avg_monthly_demand);

/** Slow-mover overstock: the founder-review set. */
export function isOverstock(it: StockShape): boolean {
  const v = velocity(it);
  if (v <= 0) return false;
  if (v >= OVERSTOCK_MAX_MONTHLY_DEMAND) return false;
  if (isNonRetailFixture(it.display_name)) return false;
  const mos = coverMonths(it);
  return Number.isFinite(mos) && mos > OVERSTOCK_MIN_MONTHS;
}

/** Understock: short of a COVERAGE_MONTHS cushion once inbound POs are counted.
 *  Seasonal: "3 months" means the NEXT three months' forecast, so stock that
 *  would last a slow summer can still be short going into a busy spring. */
export function isUnderstock(it: StockShape): boolean {
  if (velocity(it) <= 0) return false;
  return coverMonths(it) < COVERAGE_MONTHS;
}

/** Units short of COVERAGE_MONTHS of cover (0 if covered). */
export function unitsShort(it: StockShape): number {
  const need = it.demand ? demandAhead(it.demand, COVERAGE_MONTHS) : COVERAGE_MONTHS * it.avg_monthly_demand;
  return Math.max(0, need - (it.on_hand + it.on_order));
}
