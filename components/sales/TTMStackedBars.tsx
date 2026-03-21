"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { CHART_NAVY } from "@/lib/colors";

/* ---------- HELPERS ---------- */

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function buildMonthlyTotals(
  months: string[],
  products: {
    label: string;
    byMonth: Record<string, number>;
  }[]
) {
  return months.map((m) => ({
    month: formatMonthLabel(m),
    total: products.reduce(
      (sum, p) => sum + (p.byMonth[m] ?? 0),
      0
    ),
  }));
}

/* ---------- COMPONENT ---------- */

export function TTMStackedBars({
  months,
  products,
}: {
  months: string[];
  products: {
    label: string;
    byMonth: Record<string, number>;
  }[];
}) {
  const data = buildMonthlyTotals(months, products);

  return (
    <div className="h-80 w-full rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-xs font-semibold text-gray-900">
        Monthly Sales — Total
      </h3>

      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={{ stroke: "#e5e7eb" }}
            tickLine={false}
          />

          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              typeof v === "number"
                ? `$${fmtMoney(v)}`
                : ""
            }
          />

          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: 12,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
            formatter={(value) =>
              typeof value === "number"
                ? `$${fmtMoney(value)}`
                : value
            }
          />

          <Bar
            dataKey="total"
            fill={CHART_NAVY}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
