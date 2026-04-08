"use client";

import { useState } from "react";
import KPICard from "../KPICard";
import SalesChart from "../SalesChart";
import clsx from "clsx";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

type SalesKPIs = {
  wholesale_ytd_2026: number;
  wholesale_ytd_2025: number;
  wholesale_variance: number;
  d2c_ytd_2026: number;
  d2c_ytd_2025: number;
  d2c_variance: number;
  total_ytd_2026: number;
  total_ytd_2025: number;
  total_variance: number;
  ytd_label?: string;
};

type MonthlyRow = {
  month: string;
  wholesale_2025: number;
  wholesale_2026: number;
  d2c_2025: number;
  d2c_2026: number;
};

type Segment = "all" | "wholesale" | "d2c";

const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: "all", label: "All" },
  { value: "wholesale", label: "Wholesale" },
  { value: "d2c", label: "D2C" },
];

type Props = {
  kpis: SalesKPIs;
  monthlyData: MonthlyRow[];
  loading: boolean;
};

export default function SalesOverviewView({ kpis, monthlyData, loading }: Props) {
  const [segment, setSegment] = useState<Segment>("all");

  // Build chart data based on selected segment
  const chartData = monthlyData.map((r) => {
    let val2025 = 0;
    let val2026 = 0;

    if (segment === "all") {
      val2025 = r.wholesale_2025 + r.d2c_2025;
      val2026 = r.wholesale_2026 + r.d2c_2026;
    } else if (segment === "wholesale") {
      val2025 = r.wholesale_2025;
      val2026 = r.wholesale_2026;
    } else {
      val2025 = r.d2c_2025;
      val2026 = r.d2c_2026;
    }

    return { month: r.month, sales_2025: val2025, sales_2026: val2026 };
  });

  // Pick which KPIs to show based on segment
  const kpiSet = {
    all: {
      label: "Total YTD",
      ytd2026: kpis.total_ytd_2026,
      ytd2025: kpis.total_ytd_2025,
      variance: kpis.total_variance,
      color: "violet" as const,
    },
    wholesale: {
      label: "Wholesale YTD",
      ytd2026: kpis.wholesale_ytd_2026,
      ytd2025: kpis.wholesale_ytd_2025,
      variance: kpis.wholesale_variance,
      color: "emerald" as const,
    },
    d2c: {
      label: "D2C YTD",
      ytd2026: kpis.d2c_ytd_2026,
      ytd2025: kpis.d2c_ytd_2025,
      variance: kpis.d2c_variance,
      color: "sky" as const,
    },
  };

  const active = kpiSet[segment];

  const chartTitle =
    segment === "all"
      ? "Total Sales — 2026 vs 2025"
      : segment === "wholesale"
        ? "Wholesale Sales — 2026 vs 2025"
        : "D2C Sales — 2026 vs 2025";

  return (
    <div className="space-y-4">
      {/* YTD context + segment filter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {kpis.ytd_label ? (
          <p className="text-[11px] text-gray-400">
            YTD {kpis.ytd_label} — 2025 pro-rated to match elapsed days
          </p>
        ) : (
          <div />
        )}

        {/* Segment toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {SEGMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSegment(opt.value)}
              className={clsx(
                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                segment === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards — show all 3 when "all", or the selected one prominently */}
      {segment === "all" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <KPICard
            label={active.label}
            value={fmt(active.ytd2026)}
            subtitle={`vs ${fmt(active.ytd2025)} in 2025`}
            variance={active.variance}
            variantLabel="F/(U)"
            color={active.color}
          />
        </div>
      )}

      {/* Single merged chart */}
      <SalesChart
        title={chartTitle}
        data={chartData}
        bar2025Key="sales_2025"
        bar2026Key="sales_2026"
        loading={loading}
      />
    </div>
  );
}
