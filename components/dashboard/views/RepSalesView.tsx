"use client";

import { TrendingUp, TrendingDown, Minus, DollarSign, Users, Percent } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { RepSalesRow, RepSalesKPIs } from "../hooks/useDashboardRepSales";

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function VarianceIndicator({ value, pct }: { value: number; pct: number }) {
  if (Math.abs(value) < 1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-gray-400 text-[11px]">
        <Minus size={10} /> Flat
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold",
        up ? "text-emerald-600" : "text-red-500"
      )}
    >
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}
      {fmt(value)}
      <span className="font-normal text-gray-400 ml-0.5">
        ({pct > 0 ? "+" : ""}
        {pct.toFixed(0)}%)
      </span>
    </span>
  );
}

export default function RepSalesView({
  rows,
  kpis,
  loading,
}: {
  rows: RepSalesRow[];
  kpis: RepSalesKPIs;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const hasData = rows.some((r) => r.sales_2026 > 0 || r.sales_2025 > 0);

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
            Rep Sales 2026
          </div>
          <div className="text-lg font-bold tabular-nums text-gray-900">
            {fmt(kpis.total_rep_sales_2026)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
            vs 2025
          </div>
          <div className="text-lg font-bold tabular-nums text-gray-900">
            {fmt(kpis.total_rep_sales_2025)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
            Est. Commission
          </div>
          <div className="text-lg font-bold tabular-nums text-gray-900">
            {fmt(kpis.total_commission)}
          </div>
        </div>
      </div>

      {/* Rep group rows */}
      {!hasData ? (
        <div className="text-center py-6 text-sm text-gray-400">
          No rep group sales data found. Link customers to rep groups via agency codes.
        </div>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_80px_80px_100px_80px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400">
            <span>Rep Group</span>
            <span className="text-right">2026</span>
            <span className="text-right">2025</span>
            <span className="text-right">Change</span>
            <span className="text-right">Comm.</span>
          </div>

          {rows.map((r) => (
            <div
              key={r.rep_group_name}
              className="grid grid-cols-1 md:grid-cols-[1fr_80px_80px_100px_80px] gap-1 md:gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
            >
              {/* Name + territory */}
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {r.rep_group_name}
                </div>
                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                  {r.territory && <span>{r.territory}</span>}
                  <span>{r.customers} customer{r.customers !== 1 ? "s" : ""}</span>
                  <span>{r.commission_pct}%</span>
                </div>
              </div>

              {/* Mobile: inline stats */}
              <div className="flex items-center justify-between md:hidden gap-2 mt-1">
                <span className="text-xs text-gray-600 tabular-nums">{fmt(r.sales_2026)}</span>
                <span className="text-xs text-gray-400 tabular-nums">vs {fmt(r.sales_2025)}</span>
                <VarianceIndicator value={r.variance} pct={r.variance_pct} />
                <span className="text-xs text-gray-500 tabular-nums">{fmt(r.estimated_commission)}</span>
              </div>

              {/* Desktop columns */}
              <div className="hidden md:block text-right">
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {fmt(r.sales_2026)}
                </span>
              </div>
              <div className="hidden md:block text-right">
                <span className="text-sm tabular-nums text-gray-500">
                  {fmt(r.sales_2025)}
                </span>
              </div>
              <div className="hidden md:block text-right">
                <VarianceIndicator value={r.variance} pct={r.variance_pct} />
              </div>
              <div className="hidden md:block text-right">
                <span className="text-sm tabular-nums text-gray-600">
                  {fmt(r.estimated_commission)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/rep-groups"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Manage rep groups
        </Link>
      </div>
    </div>
  );
}
