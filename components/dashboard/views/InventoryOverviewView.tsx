"use client";

import { Package, AlertTriangle, Eye, CheckCircle2, TrendingDown } from "lucide-react";
import type { InventoryKPIs } from "../hooks/useDashboardInventory";

function MiniKPI({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className={`p-1.5 rounded-md ${color}`}>{icon}</div>
      <div>
        <div className="text-lg font-bold tabular-nums text-gray-900">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      </div>
    </div>
  );
}

export default function InventoryOverviewView({
  kpis,
  loading,
}: {
  kpis: InventoryKPIs;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKPI
          icon={<AlertTriangle size={14} className="text-red-600" />}
          label="At Risk"
          value={kpis.at_risk}
          color="bg-red-100"
        />
        <MiniKPI
          icon={<Eye size={14} className="text-amber-600" />}
          label="Needs Review"
          value={kpis.review}
          color="bg-amber-100"
        />
        <MiniKPI
          icon={<CheckCircle2 size={14} className="text-emerald-600" />}
          label="Healthy"
          value={kpis.healthy}
          color="bg-emerald-100"
        />
        <MiniKPI
          icon={<Package size={14} className="text-blue-600" />}
          label="Total SKUs"
          value={kpis.total_skus}
          color="bg-blue-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Total On Hand</div>
          <div className="text-lg font-bold tabular-nums text-gray-900">
            {kpis.total_on_hand.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Total On Order</div>
          <div className="text-lg font-bold tabular-nums text-gray-900">
            {kpis.total_on_order.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
