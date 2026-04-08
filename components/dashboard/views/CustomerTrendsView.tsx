"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { UserPlus, UserMinus, Users } from "lucide-react";
import Link from "next/link";
import type { HealthRow, HealthKPIs } from "../hooks/useDashboardCustomerHealth";
import type { CustomerSummaryRow } from "../hooks/useDashboardCustomers";

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

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; fill?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-800 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-semibold text-gray-800 tabular-nums">
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

type Props = {
  data: HealthRow[];
  kpis: HealthKPIs;
  loading: boolean;
  activeCustomers: number;
  customers?: CustomerSummaryRow[];
  mode?: "wholesale" | "d2c";
};

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function CustomerTrendsView({ data, kpis, loading, activeCustomers, customers, mode }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  // Build chart data with cumulative customer line
  // Anchor: activeCustomers is the REAL current active count from the DB.
  // We back-calculate prior months by reversing net changes.
  const last6 = data.slice(-6);

  // First pass: compute net change per month so we can walk backwards
  const nets = last6.map((row) =>
    row.new_customers + row.reactivated_from_churned - row.newly_churned
  );

  // Start from the known current value and walk backwards
  const cumulativeValues: number[] = new Array(last6.length);
  cumulativeValues[last6.length - 1] = activeCustomers;
  for (let i = last6.length - 2; i >= 0; i--) {
    cumulativeValues[i] = cumulativeValues[i + 1] - nets[i + 1];
  }

  const chartData = last6.map((row, i) => ({
    month: row.month,
    new_customers: row.new_customers,
    at_risk: row.newly_at_risk,
    churned: row.newly_churned,
    cumulative: cumulativeValues[i],
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <MiniKPI
          icon={<Users size={14} className="text-indigo-600" />}
          label="Active"
          value={activeCustomers}
          color="bg-indigo-100"
        />
        <MiniKPI
          icon={<UserPlus size={14} className="text-emerald-600" />}
          label="New (Latest Mo)"
          value={kpis.new_latest}
          color="bg-emerald-100"
        />
        <MiniKPI
          icon={<UserMinus size={14} className="text-rose-600" />}
          label="Churned (Latest)"
          value={kpis.churned_latest}
          color="bg-rose-100"
        />
      </div>

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            {/* Left axis — bars (monthly counts) */}
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            {/* Right axis — cumulative line */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
            <Legend
              iconType="square"
              iconSize={8}
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            />

            {/* Bars — left axis */}
            <Bar
              yAxisId="left"
              dataKey="new_customers"
              name="New"
              fill="#10b981"
              radius={[3, 3, 0, 0]}
              maxBarSize={20}
            />
            <Bar
              yAxisId="left"
              dataKey="at_risk"
              name="At Risk"
              fill="#f59e0b"
              radius={[3, 3, 0, 0]}
              maxBarSize={20}
            />
            <Bar
              yAxisId="left"
              dataKey="churned"
              name="Churned"
              fill="#ef4444"
              radius={[3, 3, 0, 0]}
              maxBarSize={20}
            />

            {/* Cumulative line — right axis */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative"
              name="Cumulative"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#6366f1", strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Recently churned customers (last 30 days crossing the 365-day threshold) */}
      {customers && customers.length > 0 && (() => {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const oneYearMs = 365 * 24 * 60 * 60 * 1000;

        const recentlyChurned = customers
          .filter((c) => {
            if (!c.last_order_date) return false;
            const lastOrder = new Date(c.last_order_date).getTime();
            const daysSince = Date.now() - lastOrder;
            // Churned (>365 days) and crossed that threshold in the last 30 days
            // i.e. last order was between 365 and 395 days ago
            return daysSince >= oneYearMs && daysSince <= oneYearMs + 30 * 24 * 60 * 60 * 1000;
          })
          .sort((a, b) => (b.lifetime_revenue ?? 0) - (a.lifetime_revenue ?? 0))
          .slice(0, 5);

        if (recentlyChurned.length === 0) return null;

        const customerHref = (id: string) =>
          mode === "d2c" ? `/customers/d2c/${id}` : `/customers/${id}`;

        return (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
              Recently Churned (Last 30 Days)
            </div>
            <div className="space-y-0.5">
              {recentlyChurned.map((c) => (
                <Link
                  key={c.id}
                  href={customerHref(c.id)}
                  className="flex items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors group"
                >
                  <span className="text-sm text-gray-700 truncate flex-1 group-hover:text-blue-600 transition-colors">
                    {c.name}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    Last order {new Date(c.last_order_date!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 shrink-0">
                    {fmt(c.lifetime_revenue ?? 0)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="pt-2 border-t border-gray-100">
        <Link href="/customers" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View customers
        </Link>
      </div>
    </div>
  );
}
