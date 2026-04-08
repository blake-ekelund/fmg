"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardCustomerHealth } from "../hooks/useDashboardCustomerHealth";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { UserPlus, UserMinus, AlertTriangle, RefreshCcw, Activity } from "lucide-react";
import Link from "next/link";

function MiniKPI({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-50">
      <div className={`p-1.5 rounded-md ${color}`}>{icon}</div>
      <div>
        <div className="text-lg font-bold tabular-nums text-gray-900">{value.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</div>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-800 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-semibold text-gray-800 tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CustomerTrendsWidget() {
  const { brand } = useBrand();
  const { data, kpis, loading } = useDashboardCustomerHealth(brand);

  const chartData = data.slice(-6);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Customer & Churn Trends</h2>
        </div>
        <Link href="/customers" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View customers
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <MiniKPI
              icon={<UserPlus size={14} className="text-emerald-600" />}
              label="New (TTM)"
              value={kpis.new_ttm}
              color="bg-emerald-100"
            />
            <MiniKPI
              icon={<UserMinus size={14} className="text-rose-600" />}
              label="Churned (Latest)"
              value={kpis.churned_latest}
              color="bg-rose-100"
            />
            <MiniKPI
              icon={<AlertTriangle size={14} className="text-amber-600" />}
              label="At Risk (Latest)"
              value={kpis.at_risk_latest}
              color="bg-amber-100"
            />
            <MiniKPI
              icon={<RefreshCcw size={14} className="text-sky-600" />}
              label="Reactivated (TTM)"
              value={kpis.reactivated_churned_ttm + kpis.reactivated_at_risk_ttm}
              color="bg-sky-100"
            />
          </div>

          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="newly_at_risk"
                  name="At Risk"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="newly_churned"
                  name="Churned"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
}
