"use client";

import KPICard from "../KPICard";
import SalesChart from "../SalesChart";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

type Props = {
  ytd2026: number;
  ytd2025: number;
  variance: number;
  ytdLabel: string;
  chartData: { month: string; sales_2025: number; sales_2026: number }[];
  loading: boolean;
  channelLabel: string;
  color: "emerald" | "sky";
};

export default function ChannelSalesView({
  ytd2026,
  ytd2025,
  variance,
  ytdLabel,
  chartData,
  loading,
  channelLabel,
  color,
}: Props) {
  return (
    <div className="space-y-4">
      {ytdLabel && (
        <p className="text-[11px] text-gray-400">
          YTD {ytdLabel} — 2025 pro-rated to match elapsed days
        </p>
      )}

      <div className="grid grid-cols-1 gap-3">
        <KPICard
          label={`${channelLabel} YTD`}
          value={fmt(ytd2026)}
          subtitle={`vs ${fmt(ytd2025)} in 2025`}
          variance={variance}
          variantLabel="F/(U)"
          color={color}
        />
      </div>

      <SalesChart
        title={`${channelLabel} Sales — 2026 vs 2025`}
        data={chartData}
        bar2025Key="sales_2025"
        bar2026Key="sales_2026"
        loading={loading}
      />
    </div>
  );
}
