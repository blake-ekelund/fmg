// /modal/tabs/DetailsTab.tsx
"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { formatDate, formatMoney } from "../utils/format";

export type CustomerSummary = {
  customerid: string;
  name: string | null;
  bill_to_state: string | null;
  channel: string | null;
  first_order_date: string | null;
  last_order_date: string | null;
  last_order_amount: number | null;
  lifetime_orders: number | null;
  lifetime_revenue: number | null;
  lifetime_aov: number | null;
};

type MonthlyRow = {
  month_key: string;
  month_date: string;
  orders: number;
  revenue: number;
};

export default function DetailsTab({
  loading,
  summary,
  monthlyData,
}: {
  loading: boolean;
  summary: CustomerSummary | null;
  monthlyData: MonthlyRow[];
}) {
  if (loading) {
    return <div className="text-sm text-slate-400">Loading summary...</div>;
  }

  if (!summary) {
    return (
      <div className="text-sm text-slate-400">
        No completed orders found for this customer.
      </div>
    );
  }

  const daysSinceLastOrder =
    summary.last_order_date
      ? Math.floor(
          (Date.now() -
            new Date(summary.last_order_date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  const recencyStatus =
    daysSinceLastOrder == null
      ? "No Orders"
      : daysSinceLastOrder < 30
      ? "Active"
      : daysSinceLastOrder < 90
      ? "Cooling"
      : "At Risk";

  const recencyStyles =
    recencyStatus === "Active"
      ? "bg-emerald-50 text-emerald-700"
      : recencyStatus === "Cooling"
      ? "bg-amber-50 text-amber-700"
      : recencyStatus === "At Risk"
      ? "bg-red-50 text-red-700"
      : "bg-slate-100 text-slate-600";

  const normalizedData = build24MonthSeries(monthlyData ?? []);
  const hasOrders = normalizedData.some((m) => m.orders > 0);

  return (
    <div className="space-y-6 mt-4">

      {/* ================= SUMMARY STRIP ================= */}
      <section className="border border-slate-200 rounded-2xl p-6 bg-white space-y-6">

        {/* Meta Row */}
        <div className="flex items-start justify-between">

          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <MetaItem label="Channel" value={summary.channel ?? "—"} />
            <MetaItem label="State" value={summary.bill_to_state ?? "—"} />
            <MetaItem
              label="Customer Since"
              value={formatDate(summary.first_order_date)}
            />
          </div>

          <div
            className={`text-xs font-medium px-3 py-1 rounded-full h-fit ${recencyStyles}`}
          >
            {recencyStatus}
          </div>

        </div>

        {/* Revenue Highlight */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Lifetime Revenue
          </div>
          <div className="text-4xl font-semibold text-slate-900 mt-1">
            {formatMoney(summary.lifetime_revenue ?? 0)}
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-6 pt-4 border-t border-slate-200 text-sm">
          <KPI label="Orders" value={summary.lifetime_orders ?? 0} />
          <KPI label="Avg Order" value={formatMoney(summary.lifetime_aov ?? 0)} />
          <KPI
            label="Last Order"
            value={formatMoney(summary.last_order_amount ?? 0)}
          />
          <KPI
            label="Days Since"
            value={
              daysSinceLastOrder != null
                ? `${daysSinceLastOrder}`
                : "—"
            }
          />
        </div>

      </section>

      {/* ================= ORDER ACTIVITY ================= */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Order Activity (Last 24 Months)
        </h3>

        {!hasOrders ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400 bg-slate-50 rounded-2xl">
            No order activity in the last 24 months.
          </div>
        ) : (
          <div className="h-64 bg-slate-50 rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={normalizedData}>
                <XAxis
                  dataKey="month"
                  tickFormatter={(value: string) =>
                    new Date(value + "-01").toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    })
                  }
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  allowDecimals={false}
                  domain={[0, "dataMax + 1"]}
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip
                  formatter={(value: number | undefined) => [
                    value ?? 0,
                    "Orders",
                  ]}
                  labelFormatter={(label: any) => {
                    if (!label) return "";
                    return new Date(String(label) + "-01")
                      .toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      });
                  }}
                />

                <Bar
                  dataKey="orders"
                  fill="#1B3C53"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

    </div>
  );
}

/* ================= Helpers ================= */

function build24MonthSeries(raw: MonthlyRow[] = []) {
  const now = new Date();
  const months: { month: string; orders: number; revenue: number }[] = [];

  const lookup = new Map(raw.map((r) => [r.month_key, r]));

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);

    const key = `${d.getFullYear()}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}`;

    const match = lookup.get(key);

    months.push({
      month: key,
      orders: match?.orders ?? 0,
      revenue: Number(match?.revenue ?? 0),
    });
  }

  return months;
}

function KPI({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}

function MetaItem({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-sm font-medium text-slate-900">
        {value}
      </div>
    </div>
  );
}