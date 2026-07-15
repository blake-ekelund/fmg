"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Loader2, AlertTriangle, Gauge, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import type { MonthRow, MonthlyPace, MonthlyEstimate } from "../hooks/useMonthlySales";
import SalesDriversPanel from "./SalesDriversPanel";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const kTick = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${Math.round(v)}`);

const CUR_COLOR = "#10b981"; // emerald-500
const PRIOR_COLOR = "#cbd5e1"; // slate-300

type Metric = "sales" | "orders" | "aov";

const METRICS: Record<
  Metric,
  { label: string; cur: (m: MonthRow) => number; prior: (m: MonthRow) => number; tick: (n: number) => string; fmt: (n: number) => string }
> = {
  sales: {
    label: "Sales",
    cur: (m) => m.revenue,
    prior: (m) => m.priorRevenue,
    tick: kTick,
    fmt: money,
  },
  orders: {
    label: "Orders",
    cur: (m) => m.orders,
    prior: (m) => m.priorOrders,
    tick: int,
    fmt: int,
  },
  aov: {
    label: "AOV",
    cur: (m) => m.aov,
    prior: (m) => (m.priorOrders > 0 ? m.priorRevenue / m.priorOrders : 0),
    tick: kTick,
    fmt: money,
  },
};

type Props = {
  months: MonthRow[];
  pace: MonthlyPace;
  estimate: MonthlyEstimate;
  loading: boolean;
  error: string | null;
};

export default function MonthlySalesView({ months, pace, estimate, loading, error }: Props) {
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

  return (
    <div className="space-y-4">
      {/* Estimates: current month (run-rate) + full year (seasonality-adjusted) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Gauge size={15} className="text-emerald-600" />
            <span className="text-sm font-semibold text-gray-900">{pace.monthLabel} estimate</span>
            <span className="text-[11px] text-gray-400">
              MTD + rest on last year&rsquo;s shape · {pace.elapsedDays} of {pace.daysInMonth} days
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <PaceStat label="Sales" value={money(pace.paceRevenue)} />
            <PaceStat label="Orders" value={int(pace.paceOrders)} />
            <PaceStat label="AOV" value={pace.paceOrders > 0 ? money(pace.paceAov) : "—"} />
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TrendingUp size={15} className="text-violet-600" />
            <span className="text-sm font-semibold text-gray-900">{estimate.year} estimate</span>
            <span className="text-[11px] text-gray-400">
              YTD + rest of year on last year&rsquo;s shape
              {estimate.yoyPct != null &&
                ` · ${estimate.yoyPct >= 0 ? "+" : "−"}${Math.abs(estimate.yoyPct).toFixed(0)}% YoY`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <PaceStat label="Sales" value={money(estimate.revenue)} />
            <PaceStat label="Orders" value={int(estimate.orders)} />
            <PaceStat label="AOV" value={estimate.orders > 0 ? money(estimate.aov) : "—"} />
          </div>
        </div>
      </div>

      {/* Two cards: left = table, right = chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT card — monthly table */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
            Monthly results
          </div>
          <MonthlyTable months={months} />
        </div>

        {/* RIGHT card — YoY chart */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-700">Monthly {METRICS[metric].label}</span>
            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              {(Object.keys(METRICS) as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={clsx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    metric === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {METRICS[m].label}
                </button>
              ))}
            </div>
          </div>
          <MonthlyChart months={months} metric={metric} />
        </div>
      </div>

      {/* YoY driver analysis */}
      <SalesDriversPanel />

      <p className="text-[11px] text-gray-400">
        Sales from Fishbowl · click a month for its full daily log · this year vs. same period last
        year
      </p>
    </div>
  );
}

/* --------------------------------- table ---------------------------------- */

function MonthlyTable({ months }: { months: MonthRow[] }) {
  const router = useRouter();
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-400">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Month</th>
            <th className="px-4 py-2 text-right font-medium">Orders</th>
            <th className="px-4 py-2 text-right font-medium">Sales</th>
            <th className="px-4 py-2 text-right font-medium">AOV</th>
            <th className="px-4 py-2 text-right font-medium">vs LY</th>
            <th className="w-6 px-1 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {months.map((m) => (
            <tr
              key={m.monthKey}
              onClick={() => router.push(`/dashboard/daily-sales?month=${m.monthKey}`)}
              className={clsx(
                "group cursor-pointer transition-colors",
                m.isCurrent ? "bg-emerald-50/50 hover:bg-emerald-50" : "hover:bg-gray-50",
              )}
            >
              <td className="px-4 py-2.5 font-medium text-gray-800">
                {m.monthLabel}
                {m.isPartial && (
                  <span className="ml-1.5 text-[10px] font-normal text-gray-400">MTD</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{int(m.orders)}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                {money(m.revenue)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                {m.orders > 0 ? money(m.aov) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Variance row={m} />
              </td>
              <td className="px-1 py-2.5 text-right">
                <ChevronRight
                  size={15}
                  className="text-gray-300 transition-colors group-hover:text-gray-500"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------- chart ---------------------------------- */

type ChartDatum = { month: string; cur: number; prior: number };

function MonthlyChart({ months, metric }: { months: MonthRow[]; metric: Metric }) {
  const cfg = METRICS[metric];
  const curYear = new Date().getFullYear();
  const data: ChartDatum[] = months.map((m) => ({
    month: m.monthLabel,
    cur: cfg.cur(m),
    prior: cfg.prior(m),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barGap={2} barCategoryGap="24%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval="preserveStartEnd"
          minTickGap={6}
        />
        <YAxis
          tickFormatter={cfg.tick}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip content={<ChartTooltip metric={metric} curYear={curYear} />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="prior" name={`${curYear - 1}`} fill={PRIOR_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Bar dataKey="cur" name={`${curYear}`} fill={CUR_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  metric,
  curYear,
}: {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
  label?: string;
  metric: Metric;
  curYear: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const fmt = METRICS[metric].fmt;
  const delta = d.cur - d.prior;
  return (
    <div className="rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-1 font-semibold text-gray-800">{label}</div>
      <div className="space-y-0.5 tabular-nums">
        <TipRow color={CUR_COLOR} label={`${curYear}`} value={fmt(d.cur)} />
        <TipRow color={PRIOR_COLOR} label={`${curYear - 1}`} value={fmt(d.prior)} />
        {d.prior > 0 && (
          <div className={clsx("pt-0.5 font-semibold", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta))} vs LY
          </div>
        )}
      </div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-gray-500">{label}:</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}

/* --------------------------------- bits ----------------------------------- */

function PaceStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

function Variance({ row }: { row: MonthRow }) {
  if (row.priorRevenue === 0 && row.variance === 0) {
    return <span className="text-xs text-gray-300">—</span>;
  }
  const up = row.variance >= 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-end gap-1 text-xs font-semibold tabular-nums",
        up ? "text-emerald-600" : "text-rose-600",
      )}
      title={`${money(row.revenue)} vs ${money(row.priorRevenue)} last year`}
    >
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "" : "−"}
      {money(Math.abs(row.variance))}
      {row.variancePct != null && (
        <span className="font-normal text-gray-400">
          ({up ? "+" : "−"}
          {Math.abs(row.variancePct).toFixed(0)}%)
        </span>
      )}
    </span>
  );
}
