"use client";

import { useBrand } from "@/components/BrandContext";
import { useDashboardSales } from "./hooks/useDashboardSales";
import { useDashboardCustomerHealth } from "./hooks/useDashboardCustomerHealth";
import KPICard from "./KPICard";
import SalesChart from "./SalesChart";
import CustomerHealthChart from "./CustomerHealthChart";
import type { BrandFilter } from "@/types/brand";
import clsx from "clsx";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const BRAND_OPTIONS: { value: BrandFilter; label: string }[] = [
  { value: "all", label: "All Brands" },
  { value: "NI", label: "NI" },
  { value: "Sassy", label: "Sassy" },
];

export default function DashboardPage() {
  const { brand, setBrand } = useBrand();
  const { data: salesData, kpis, loading: salesLoading } = useDashboardSales(brand);
  const { data: healthData, kpis: healthKpis, loading: healthLoading } = useDashboardCustomerHealth(brand);

  // Prepare chart data for wholesale and D2C
  const wholesaleChartData = salesData.map((r) => ({
    month: r.month,
    wholesale_2025: r.wholesale_2025,
    wholesale_2026: r.wholesale_2026,
  }));

  const d2cChartData = salesData.map((r) => ({
    month: r.month,
    d2c_2025: r.d2c_2025,
    d2c_2026: r.d2c_2026,
  }));

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header + Brand Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sales performance, customer health, and trends at a glance.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {BRAND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBrand(opt.value)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                brand === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Sales KPIs ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard
          label="Wholesale YTD"
          value={fmt(kpis.wholesale_ytd_2026)}
          subtitle={`vs ${fmt(kpis.wholesale_ytd_2025)} in 2025`}
          variance={kpis.wholesale_variance}
          variantLabel="F/(U)"
          color="emerald"
        />
        <KPICard
          label="D2C YTD"
          value={fmt(kpis.d2c_ytd_2026)}
          subtitle={`vs ${fmt(kpis.d2c_ytd_2025)} in 2025`}
          variance={kpis.d2c_variance}
          variantLabel="F/(U)"
          color="sky"
        />
        <KPICard
          label="Total YTD"
          value={fmt(kpis.total_ytd_2026)}
          subtitle={`vs ${fmt(kpis.total_ytd_2025)} in 2025`}
          variance={kpis.total_variance}
          variantLabel="F/(U)"
          color="violet"
        />
        <KPICard
          label="New Customers"
          value={healthKpis.new_ttm.toLocaleString()}
          subtitle="TTM total"
          color="emerald"
        />
        <KPICard
          label="At Risk"
          value={healthKpis.at_risk_current.toLocaleString()}
          subtitle="Current count"
          color="amber"
        />
      </div>

      {/* ─── Sales Charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesChart
          title="Wholesale Sales — 2026 vs 2025"
          data={wholesaleChartData}
          bar2025Key="wholesale_2025"
          bar2026Key="wholesale_2026"
          loading={salesLoading}
        />
        <SalesChart
          title="D2C Sales — 2026 vs 2025"
          data={d2cChartData}
          bar2025Key="d2c_2025"
          bar2026Key="d2c_2026"
          loading={salesLoading}
        />
      </div>

      {/* ─── Customer Health ─── */}
      <CustomerHealthChart data={healthData} loading={healthLoading} />
    </div>
  );
}
