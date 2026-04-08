"use client";

import Link from "next/link";
import clsx from "clsx";
import type { DashboardInventoryItem } from "../hooks/useDashboardInventory";

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  at_risk: { dot: "bg-red-500", label: "At Risk" },
  review: { dot: "bg-amber-400", label: "Review" },
  healthy: { dot: "bg-emerald-500", label: "Healthy" },
  no_demand: { dot: "bg-gray-300", label: "No Demand" },
};

type GroupSummary = {
  part_type: string;
  total: number;
  at_risk: number;
  review: number;
  healthy: number;
};

export default function InventoryBreakdownView({
  items,
  loading,
}: {
  items: DashboardInventoryItem[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // Group by part_type
  const groupMap = new Map<string, GroupSummary>();
  for (const item of items) {
    const key = item.part_type || "Other";
    const existing = groupMap.get(key) ?? {
      part_type: key,
      total: 0,
      at_risk: 0,
      review: 0,
      healthy: 0,
    };
    existing.total++;
    if (item.status === "at_risk") existing.at_risk++;
    else if (item.status === "review") existing.review++;
    else if (item.status === "healthy") existing.healthy++;
    groupMap.set(key, existing);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => b.at_risk - a.at_risk);

  if (groups.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-400">
        No forecasted products found
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400">
        <span>Category</span>
        <span className="text-center">Total</span>
        <span className="text-center">At Risk</span>
        <span className="text-center">Review</span>
        <span className="text-center">Healthy</span>
      </div>

      {groups.map((g) => (
        <div
          key={g.part_type}
          className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-1 items-center px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700 truncate">
            {g.part_type}
          </span>
          <span className="text-sm text-center tabular-nums text-gray-600">
            {g.total}
          </span>
          <span
            className={clsx(
              "text-sm text-center tabular-nums font-semibold",
              g.at_risk > 0 ? "text-red-600" : "text-gray-300"
            )}
          >
            {g.at_risk}
          </span>
          <span
            className={clsx(
              "text-sm text-center tabular-nums font-semibold",
              g.review > 0 ? "text-amber-600" : "text-gray-300"
            )}
          >
            {g.review}
          </span>
          <span
            className={clsx(
              "text-sm text-center tabular-nums font-semibold",
              g.healthy > 0 ? "text-emerald-600" : "text-gray-300"
            )}
          >
            {g.healthy}
          </span>
        </div>
      ))}

      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/inventory"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Manage inventory
        </Link>
      </div>
    </div>
  );
}
