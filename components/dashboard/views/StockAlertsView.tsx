"use client";

import { AlertTriangle, Eye, Package } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { DashboardInventoryItem, InventoryStatus } from "../hooks/useDashboardInventory";

const STATUS_CONFIG: Record<
  "at_risk" | "review",
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  at_risk: {
    label: "At Risk",
    bg: "bg-red-50",
    text: "text-red-700",
    icon: <AlertTriangle size={12} className="text-red-500" />,
  },
  review: {
    label: "Review",
    bg: "bg-amber-50",
    text: "text-amber-700",
    icon: <Eye size={12} className="text-amber-500" />,
  },
};

export default function StockAlertsView({
  items,
  loading,
}: {
  items: DashboardInventoryItem[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // Show only at_risk and review items, sorted by months_of_supply ascending
  const alerts = items
    .filter((r) => r.status === "at_risk" || r.status === "review")
    .sort((a, b) => a.months_of_supply - b.months_of_supply)
    .slice(0, 12);

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <Package size={28} className="mb-2 text-emerald-300" />
        <span className="text-sm font-medium">All inventory levels healthy</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {alerts.map((item) => {
        const cfg = STATUS_CONFIG[item.status as "at_risk" | "review"];
        return (
          <div
            key={item.part}
            className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2"
          >
            <div className="shrink-0">{cfg.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 truncate">
                {item.display_name}
              </div>
              <div className="text-[11px] text-gray-400">
                {item.part} &middot; {item.brand}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold tabular-nums text-gray-900">
                {item.on_hand.toLocaleString()}
              </div>
              <div className="text-[10px] text-gray-400">on hand</div>
            </div>
            <div
              className={clsx(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                cfg.bg,
                cfg.text
              )}
            >
              {item.months_of_supply === Infinity
                ? "N/A"
                : `${item.months_of_supply.toFixed(1)}mo`}
            </div>
          </div>
        );
      })}
      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/inventory"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          View full forecast
        </Link>
      </div>
    </div>
  );
}
