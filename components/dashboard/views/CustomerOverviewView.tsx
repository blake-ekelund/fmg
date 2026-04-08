"use client";

import { UserPlus, UserX, UserCheck } from "lucide-react";
import Link from "next/link";
import type { CustomerSummaryRow, CustomerKPIs } from "../hooks/useDashboardCustomers";

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

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function CustomerOverviewView({
  customers,
  kpis,
  loading,
  mode,
}: {
  customers: CustomerSummaryRow[];
  kpis: CustomerKPIs;
  loading: boolean;
  mode: "wholesale" | "d2c";
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Top 10 customers by 2026 revenue + "Other" + Total
  const paying = [...customers]
    .filter((c) => (c.sales_2026 ?? 0) > 0)
    .sort((a, b) => (b.sales_2026 ?? 0) - (a.sales_2026 ?? 0));

  const top10 = paying.slice(0, 10);
  const rest = paying.slice(10);
  const otherRevenue = rest.reduce((s, c) => s + (c.sales_2026 ?? 0), 0);
  const totalRevenue = paying.reduce((s, c) => s + (c.sales_2026 ?? 0), 0);

  const href = mode === "wholesale" ? "/customers" : "/customers/d2c";

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <MiniKPI
          icon={<UserCheck size={14} className="text-emerald-600" />}
          label="Active"
          value={kpis.active}
          color="bg-emerald-100"
        />
        <MiniKPI
          icon={<UserPlus size={14} className="text-blue-600" />}
          label="New"
          value={kpis.new_customers}
          color="bg-blue-100"
        />
        <MiniKPI
          icon={<UserX size={14} className="text-red-600" />}
          label="Churned"
          value={kpis.churned}
          color="bg-red-100"
        />
      </div>

      {/* Top customers */}
      {top10.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
            Top Customers — 2026
          </div>
          <div className="space-y-0.5">
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400">
              <span className="w-4 shrink-0" />
              <span className="flex-1">Customer</span>
              <span className="w-12 text-right shrink-0">% Sales</span>
              <span className="w-20 text-right shrink-0">Revenue</span>
            </div>

            {top10.map((c, i) => {
              const customerHref =
                mode === "wholesale"
                  ? `/customers/${c.id}`
                  : `/customers/d2c/${c.id}`;
              const pct = totalRevenue > 0
                ? ((c.sales_2026 ?? 0) / totalRevenue) * 100
                : 0;
              return (
                <Link
                  key={c.id}
                  href={customerHref}
                  className="flex items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors group"
                >
                  <span className="text-xs font-bold text-gray-300 w-4 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700 truncate flex-1 group-hover:text-blue-600 transition-colors">
                    {c.name}
                  </span>
                  <span className="text-[11px] tabular-nums text-gray-400 w-12 text-right shrink-0">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 w-20 text-right shrink-0">
                    {fmt(c.sales_2026 ?? 0)}
                  </span>
                </Link>
              );
            })}

            {/* Other */}
            {rest.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-1.5 text-gray-400">
                <span className="text-xs font-bold w-4 shrink-0" />
                <span className="text-sm italic flex-1">
                  Other ({rest.length} customer{rest.length !== 1 ? "s" : ""})
                </span>
                <span className="text-[11px] tabular-nums w-12 text-right shrink-0">
                  {totalRevenue > 0 ? ((otherRevenue / totalRevenue) * 100).toFixed(1) : "0.0"}%
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-500 w-20 text-right shrink-0">
                  {fmt(otherRevenue)}
                </span>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center gap-3 px-3 py-1.5 border-t border-gray-100 mt-1 pt-1.5">
              <span className="text-xs font-bold w-4 shrink-0" />
              <span className="text-sm font-semibold text-gray-800 flex-1">
                Total
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-gray-600 w-12 text-right shrink-0">
                100%
              </span>
              <span className="text-sm font-bold tabular-nums text-gray-900 w-20 text-right shrink-0">
                {fmt(totalRevenue)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-gray-100">
        <Link
          href={href}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          View all {mode === "wholesale" ? "wholesale" : "D2C"} customers
        </Link>
      </div>
    </div>
  );
}
