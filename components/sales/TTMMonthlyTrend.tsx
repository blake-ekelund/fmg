"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import { CHART_NAVY, CHART_MUTED } from "@/lib/colors";
import { formatMonthLabel, fmtMoney, fmtMoneyCompact, pctChange } from "./constants";

type Point = {
  month: string;
  current: number;
  prior: number | null;
};

/**
 * Monthly revenue across the trailing 12 months, with the same months a year
 * earlier drawn behind it for context.
 *
 * Replaces TTMStackedBars, which was neither stacked nor a comparison: it
 * summed every product series into one flat total bar, so the page's
 * products/fragrances toggle changed nothing about it and there was no
 * baseline to read "up or down against what?".
 *
 * This is the *emphasis* form rather than two categorical series — the current
 * year is the subject and last year is background — so the accent stays brand
 * navy and the context line takes the de-emphasis gray. Both measure dollars
 * on one shared axis; a second y-scale would make the two lines' crossings
 * meaningless.
 */
export function TTMMonthlyTrend({
  months,
  currentByMonth,
  priorByMonth,
}: {
  months: string[];
  currentByMonth: Record<string, number>;
  /** Same 12 slots shifted back a year; empty when prior-year data is absent. */
  priorByMonth: Record<string, number>;
}) {
  const hasPrior = Object.keys(priorByMonth).length > 0;

  const data: Point[] = months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    const priorKey = `${y - 1}-${String(mo).padStart(2, "0")}-01`;
    return {
      month: formatMonthLabel(m),
      current: currentByMonth[m] ?? 0,
      prior: hasPrior ? (priorByMonth[priorKey] ?? 0) : null,
    };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
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
            const delta = p.prior == null ? null : pctChange(p.current, p.prior);

            return (
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
                <div className="mb-1 font-medium text-gray-900">{label}</div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: CHART_NAVY }}
                  />
                  This year: ${fmtMoney(p.current)}
                </div>
                {p.prior != null && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ backgroundColor: CHART_MUTED }}
                    />
                    Last year: ${fmtMoney(p.prior)}
                  </div>
                )}
                {delta != null && (
                  <div
                    className={
                      delta >= 0
                        ? "mt-1 font-medium text-green-700"
                        : "mt-1 font-medium text-red-600"
                    }
                  >
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}% YoY
                  </div>
                )}
              </div>
            );
          }}
        />

        {/* Two marks on the chart, so identity is never carried by color alone. */}
        <Legend
          verticalAlign="top"
          align="right"
          height={24}
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 10, color: "#6b7280", paddingBottom: 4 }}
        />

        <Bar
          dataKey="current"
          name="This year"
          fill={CHART_NAVY}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />

        {hasPrior && (
          <Line
            type="monotone"
            dataKey="prior"
            name="Last year"
            stroke={CHART_MUTED}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2.5, fill: CHART_MUTED, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
