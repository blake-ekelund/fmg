import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─── Trend types ─── */

export type Trend = "growing" | "declining" | "stable" | "new" | "unknown";

export type TrendConfig = {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  rank: number;
};

export const TREND_CONFIG: Record<Trend, TrendConfig> = {
  growing: {
    label: "Growing",
    icon: TrendingUp,
    color: "text-green-600",
    bg: "bg-green-50",
    rank: 1,
  },
  new: {
    label: "New",
    icon: TrendingUp,
    color: "text-blue-600",
    bg: "bg-blue-50",
    rank: 2,
  },
  stable: {
    label: "Stable",
    icon: Minus,
    color: "text-gray-500",
    bg: "bg-gray-100",
    rank: 3,
  },
  declining: {
    label: "Declining",
    icon: TrendingDown,
    color: "text-red-500",
    bg: "bg-red-50",
    rank: 4,
  },
  unknown: {
    label: "No data",
    icon: Minus,
    color: "text-gray-300",
    bg: "bg-gray-50",
    rank: 5,
  },
};

/**
 * Compute trend from two 90-day sales windows.
 *
 * @param recent90  — total units sold in the last 90 days
 * @param prior90   — total units sold in the 90 days before that (days 91–180)
 * @param hasSalesInLast180 — whether there are any sales in the 180-day window
 * @param hasSalesBefore180 — whether there are any sales before the 180-day window
 *
 * Rules:
 * - No sales at all → "unknown"
 * - Sales in last 180 days but none before → "new"
 * - prior90 = 0, recent90 > 0 → "new" (all sales are very recent)
 * - +10% change → "growing"
 * - -10% change → "declining"
 * - In between → "stable"
 */
export function computeTrend(
  recent90: number,
  prior90: number,
  hasSalesInLast180 = true,
  hasSalesBefore180 = false
): Trend {
  // No sales at all
  if (recent90 === 0 && prior90 === 0) return "unknown";

  // New product: sales exist in last 180 days but nothing before that
  if (hasSalesInLast180 && !hasSalesBefore180 && recent90 > 0) return "new";

  // All sales in recent window, none in prior
  if (prior90 === 0 && recent90 > 0) return "new";
  if (prior90 === 0) return "unknown";

  const change = (recent90 - prior90) / prior90;
  if (change >= 0.1) return "growing";
  if (change <= -0.1) return "declining";
  return "stable";
}
