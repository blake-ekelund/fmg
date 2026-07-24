/**
 * Shared inventory-health definitions.
 *
 * The dashboard's "review overstock / understock" asks and the inventory
 * page's filters have to agree on what those words mean, so the thresholds and
 * predicates live here rather than being re-derived (and drifting) in each.
 */

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
};

/** Slow-mover overstock: the founder-review set. */
export function isOverstock(it: StockShape): boolean {
  if (it.avg_monthly_demand <= 0) return false;
  if (it.avg_monthly_demand >= OVERSTOCK_MAX_MONTHLY_DEMAND) return false;
  if (isNonRetailFixture(it.display_name)) return false;
  const mos = monthsOfSupply(it.on_hand, it.on_order, it.avg_monthly_demand);
  return Number.isFinite(mos) && mos > OVERSTOCK_MIN_MONTHS;
}

/** Understock: short of a COVERAGE_MONTHS cushion once inbound POs are counted. */
export function isUnderstock(it: StockShape): boolean {
  if (it.avg_monthly_demand <= 0) return false;
  const mos = monthsOfSupply(it.on_hand, it.on_order, it.avg_monthly_demand);
  return mos < COVERAGE_MONTHS;
}
