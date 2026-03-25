"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { UserPlus, UserMinus, AlertTriangle, RefreshCcw, Repeat } from "lucide-react";
import type { HealthRow, HealthKPIs } from "./hooks/useDashboardCustomerHealth";

type Props = {
  data: HealthRow[];
  kpis: HealthKPIs;
  loading?: boolean;
};

/* ─── Shared tooltip ─── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <div className="font-semibold text-gray-800 mb-1.5">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-semibold text-gray-800 tabular-nums">
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Mini KPI chip ─── */
function MiniKPI({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${color}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
        <div className="text-xl font-bold tabular-nums text-gray-900">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

export default function CustomerHealthSection({ data, kpis, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Customer Health</h2>
        <div className="h-64 flex items-center justify-center text-sm text-gray-400 rounded-2xl border border-gray-200 bg-white">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-800">Customer Health — TTM</h2>

      {/* ─── KPI Row ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniKPI
          icon={<UserPlus size={18} className="text-emerald-500" />}
          label="New Customers"
          value={kpis.new_ttm}
          color="bg-emerald-50 border-emerald-200"
        />
        <MiniKPI
          icon={<AlertTriangle size={18} className="text-amber-500" />}
          label="Newly At Risk"
          value={kpis.at_risk_latest}
          color="bg-amber-50 border-amber-200"
        />
        <MiniKPI
          icon={<UserMinus size={18} className="text-rose-500" />}
          label="Newly Churned"
          value={kpis.churned_latest}
          color="bg-rose-50 border-rose-200"
        />
        <MiniKPI
          icon={<RefreshCcw size={18} className="text-sky-500" />}
          label="Churned → Active"
          value={kpis.reactivated_churned_ttm}
          color="bg-sky-50 border-sky-200"
        />
        <MiniKPI
          icon={<RefreshCcw size={18} className="text-violet-500" />}
          label="At Risk → Active"
          value={kpis.reactivated_at_risk_ttm}
          color="bg-violet-50 border-violet-200"
        />
        <MiniKPI
          icon={<Repeat size={18} className="text-indigo-500" />}
          label="Reorders"
          value={kpis.reorders_ttm}
          color="bg-indigo-50 border-indigo-200"
        />
      </div>

      {/* ─── Chart 1: Growth & Acquisition (New Customers + Reorders) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">New Customers & Reorders</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={35} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="new_customers" name="New Customers" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="reorders" name="Reorders" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ─── Chart 2: Churn & Risk (Newly At Risk + Newly Churned) ─── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">Churn & Risk Trends</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={35} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e2e8f0" }} />
              <Legend iconType="line" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line type="monotone" dataKey="newly_at_risk" name="Newly At Risk" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="newly_churned" name="Newly Churned" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Chart 3: Reactivations ─── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">Reactivations — Customers Returning to Active</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={35} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
            <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="reactivated_from_churned" name="Churned → Active" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="reactivated_from_at_risk" name="At Risk → Active" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Monthly Detail Table ─── */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="text-sm font-semibold text-gray-700">Monthly Detail</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50/70 text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2.5 font-medium">Month</th>
                <th className="text-right px-4 py-2.5 font-medium">New</th>
                <th className="text-right px-4 py-2.5 font-medium">Reorders</th>
                <th className="text-right px-4 py-2.5 font-medium">At Risk</th>
                <th className="text-right px-4 py-2.5 font-medium">Churned</th>
                <th className="text-right px-4 py-2.5 font-medium">Churned→Active</th>
                <th className="text-right px-4 py-2.5 font-medium">AtRisk→Active</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.month} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                  <td className="px-4 py-2 font-medium text-gray-700">{row.month}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600 font-semibold">{row.new_customers}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-indigo-600 font-semibold">{row.reorders}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-600 font-semibold">{row.newly_at_risk}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600 font-semibold">{row.newly_churned}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-sky-600 font-semibold">{row.reactivated_from_churned}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-violet-600 font-semibold">{row.reactivated_from_at_risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
