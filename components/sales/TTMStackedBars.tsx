"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

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
    <div className="h-80 w-full rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-2 text-sm font-medium text-gray-700">
        Monthly Sales — Total
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="month" />

          <YAxis
            tickFormatter={(v) =>
              typeof v === "number"
                ? `$${fmtMoney(v)}`
                : ""
            }
          />

          <Tooltip
            formatter={(value) =>
              typeof value === "number"
                ? `$${fmtMoney(value)}`
                : value
            }
          />

          {/* SINGLE BAR PER MONTH */}
          <Bar
            dataKey="total"
            fill="#1B3C53"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
