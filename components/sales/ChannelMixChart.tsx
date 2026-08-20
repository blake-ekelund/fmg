"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import { CHART_NAVY, ACCENT_GOLD } from "@/lib/colors";
import { formatMonthLabel, fmtMoney, fmtMoneyCompact } from "./constants";
import type { ChannelMonth } from "./useChannelSales";

type Point = {
  month: string;
  wholesale: number | null;
  d2c: number | null;
  covered: boolean;
};

/**
 * Wholesale and D2C revenue side by side across the trailing 12 months.
 *
 * Grouped rather than stacked: the question this answers is "how is each
 * channel doing", and a stacked bar makes the upper segment's baseline move
 * with the lower one, so D2C's own trend becomes unreadable. Two categorical
 * hues, since neither channel is background to the other.
 *
 * Months the source doesn't cover carry null and draw no bar at all — a zero
 * bar would read as "we sold nothing", which is a different claim.
 */
export function ChannelMixChart({ series }: { series: ChannelMonth[] }) {
  const data: Point[] = series.map((m) => ({
    month: formatMonthLabel(m.month),
    wholesale: m.wholesale,
    d2c: m.d2c,
    covered: m.wholesale != null || m.d2c != null,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#e5e7eb" vertical={false} />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={8}
        />

        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v) => (typeof v === "number" ? fmtMoneyCompact(v) : "")}
        />

        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
          content={({ active, payload, label }: TooltipContentProps<number, string>) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]?.payload as Point | undefined;
            if (!p) return null;

            if (!p.covered) {
              return (
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
                  <div className="mb-1 font-medium text-gray-900">{label}</div>
                  <div className="text-gray-500">No channel data for this month</div>
                </div>
              );
            }

            const total = (p.wholesale ?? 0) + (p.d2c ?? 0);
            return (
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
                <div className="mb-1 font-medium text-gray-900">{label}</div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: CHART_NAVY }}
                  />
                  Wholesale: ${fmtMoney(p.wholesale ?? 0)}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: ACCENT_GOLD }}
                  />
                  D2C: ${fmtMoney(p.d2c ?? 0)}
                </div>
                {total > 0 && (
                  <div className="mt-1 text-gray-500">
                    D2C is {Math.round(((p.d2c ?? 0) / total) * 100)}% of the month
                  </div>
                )}
              </div>
            );
          }}
        />

        <Legend
          verticalAlign="top"
          align="right"
          height={24}
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 10, color: "#6b7280", paddingBottom: 4 }}
        />

        <Bar
          dataKey="wholesale"
          name="Wholesale"
          fill={CHART_NAVY}
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
        <Bar
          dataKey="d2c"
          name="D2C"
          fill={ACCENT_GOLD}
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
