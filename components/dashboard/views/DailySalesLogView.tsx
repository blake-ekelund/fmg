"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Loader2, Receipt, AlertTriangle, Gauge } from "lucide-react";
import clsx from "clsx";
import type { DaySummary, DailySalesKPIs } from "../hooks/useDailySalesLog";

/* --------------------------------- format --------------------------------- */

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const kTick = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${Math.round(v)}`;

type Metric = "sales" | "orders" | "aov";

const METRICS: Record<
  Metric,
  {
    label: string;
    color: string;
    get: (d: DaySummary) => number;
    fmt: (n: number) => string;
    tick: (n: number) => string;
  }
> = {
  sales: { label: "Sales", color: "#10b981", get: (d) => d.revenue, fmt: money, tick: kTick },
  orders: { label: "Orders", color: "#6366f1", get: (d) => d.orders, fmt: int, tick: int },
  aov: { label: "AOV", color: "#f59e0b", get: (d) => d.aov, fmt: money, tick: kTick },
};

type Props = {
  days: DaySummary[];
  kpis: DailySalesKPIs;
  loading: boolean;
  error: string | null;
};

/* --------------------------------- chart ---------------------------------- */

type ChartDatum = {
  dayNum: number;
  dateLong: string;
  sales: number;
  orders: number;
  aov: number;
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-1 font-semibold text-gray-800">{d.dateLong}</div>
      <div className="space-y-0.5 tabular-nums">
        <Row label="Sales" value={money(d.sales)} color={METRICS.sales.color} />
        <Row label="Orders" value={int(d.orders)} color={METRICS.orders.color} />
        <Row label="AOV" value={d.orders > 0 ? money(d.aov) : "—"} color={METRICS.aov.color} />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-gray-500">{label}:</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}

function DailyChart({
  days,
  kpis,
  metric,
}: {
  days: DaySummary[];
  kpis: DailySalesKPIs;
  metric: Metric;
}) {
  const cfg = METRICS[metric];
  // `days` is already chronological (1st → yesterday), which is left→right.
  const data: ChartDatum[] = days.map((d) => ({
    dayNum: Number(d.dateKey.slice(8, 10)),
    dateLong: d.dateLong,
    sales: d.revenue,
    orders: d.orders,
    aov: d.aov,
  }));

  // Run-rate reference: MTD run rate per elapsed day (flat MTD AOV for AOV).
  const ref =
    metric === "aov"
      ? kpis.mtdAov
      : kpis.elapsedDays > 0
        ? (metric === "sales" ? kpis.mtdRevenue : kpis.mtdOrders) / kpis.elapsedDays
        : 0;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="dayNum"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tickFormatter={cfg.tick}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
        {ref > 0 && (
          <ReferenceLine
            y={ref}
            stroke={cfg.color}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: "run rate", position: "right", fontSize: 10, fill: cfg.color }}
          />
        )}
        <Bar dataKey={metric} fill={cfg.color} radius={[4, 4, 0, 0]} maxBarSize={30} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* --------------------------------- table ---------------------------------- */

function DailyTable({ days, kpis }: { days: DaySummary[]; kpis: DailySalesKPIs }) {
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-400">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Date</th>
            <th className="px-4 py-2 text-right font-medium">Orders</th>
            <th className="px-4 py-2 text-right font-medium">Sales</th>
            <th className="px-4 py-2 text-right font-medium">AOV</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {days.map((d) => (
            <tr key={d.dateKey} className="hover:bg-gray-50/60">
              <td className="px-4 py-2 text-gray-700">{d.label}</td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-600">{int(d.orders)}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">
                {money(d.revenue)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                {d.orders > 0 ? money(d.aov) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 border-t border-gray-200 bg-gray-50 text-gray-900">
          <tr className="font-semibold tabular-nums">
            <td className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">
              Month to date
            </td>
            <td className="px-4 py-2 text-right">{int(kpis.mtdOrders)}</td>
            <td className="px-4 py-2 text-right">{money(kpis.mtdRevenue)}</td>
            <td className="px-4 py-2 text-right">{kpis.mtdOrders > 0 ? money(kpis.mtdAov) : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---------------------------------- pace ---------------------------------- */

function PacePanel({ kpis }: { kpis: DailySalesKPIs }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gauge size={15} className="text-emerald-600" />
        <span className="text-sm font-semibold text-gray-900">
          On pace for {kpis.monthLabel}
        </span>
        <span className="text-[11px] text-gray-400">
          projected at the current run rate · {kpis.elapsedDays} of {kpis.daysInMonth} days
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <PaceStat label="Sales" value={money(kpis.paceRevenue)} />
        <PaceStat label="Orders" value={int(kpis.paceOrders)} />
        <PaceStat label="AOV" value={kpis.paceOrders > 0 ? money(kpis.paceAov) : "—"} />
      </div>
    </div>
  );
}

function PaceStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

/* ---------------------------------- view ---------------------------------- */

export default function DailySalesLogView({ days, kpis, loading, error }: Props) {
  const [metric, setMetric] = useState<Metric>("sales");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
        <Loader2 size={15} className="animate-spin" /> Loading sales…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        {error}
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
        <Receipt size={22} className="mx-auto text-gray-300" />
        <p className="mx-auto mt-3 max-w-sm text-sm text-gray-400">
          No completed sales yet this month — the log fills in from the daily Fishbowl sync (shows
          the 1st through yesterday).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-400">
        {kpis.rangeLabel} · from Fishbowl
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT card — daily table */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
            Daily log
          </div>
          <DailyTable days={days} kpis={kpis} />
        </div>

        {/* RIGHT card — chart (we'll refine this next) */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-700">
              Daily {METRICS[metric].label}
            </span>
            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              {(Object.keys(METRICS) as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={clsx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    metric === m
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {METRICS[m].label}
                </button>
              ))}
            </div>
          </div>
          <DailyChart days={days} kpis={kpis} metric={metric} />
        </div>
      </div>

      {/* On-pace projection */}
      <PacePanel kpis={kpis} />
    </div>
  );
}
