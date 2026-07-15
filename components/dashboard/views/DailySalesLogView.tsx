"use client";

import { Loader2, Receipt, AlertTriangle } from "lucide-react";
import KPICard from "../KPICard";
import type { DaySummary, DailySalesKPIs } from "../hooks/useDailySalesLog";

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

type Props = {
  days: DaySummary[];
  kpis: DailySalesKPIs;
  loading: boolean;
  error: string | null;
};

/** One day's row: date, D2C/Wholesale split bar, order count, revenue. */
function DayRow({ day, maxRevenue }: { day: DaySummary; maxRevenue: number }) {
  const pct = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
  const d2cPct = day.revenue > 0 ? (day.d2cRevenue / day.revenue) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-24 shrink-0">
        <div className="text-sm font-medium text-gray-900">{day.label}</div>
        <div className="text-[11px] text-gray-400">
          {day.orders} {day.orders === 1 ? "order" : "orders"}
        </div>
      </div>

      {/* Proportional bar — width by day's share of the best day, split by channel */}
      <div className="flex-1">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="flex h-full" style={{ width: `${pct}%` }}>
            <div className="h-full bg-pink-400" style={{ width: `${d2cPct}%` }} />
            <div
              className="h-full bg-indigo-400"
              style={{ width: `${100 - d2cPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">
        {fmt(day.revenue)}
      </div>
    </div>
  );
}

export default function DailySalesLogView({
  days,
  kpis,
  loading,
  error,
}: Props) {
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
          No completed sales yet this month — the log fills in from the daily
          Fishbowl sync (shows the 1st through yesterday).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-400">
        Month-to-date · {kpis.rangeLabel} (through yesterday) · from Fishbowl
      </p>

      {/* MTD at a glance */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard
          label="MTD Sales"
          value={fmt(kpis.mtdRevenue)}
          subtitle={`${kpis.mtdOrders} ${
            kpis.mtdOrders === 1 ? "order" : "orders"
          } · ${fmt(kpis.avgPerDay)}/day avg`}
          color="emerald"
        />
        <KPICard
          label="Channel split"
          value={fmt(kpis.mtdWholesale)}
          subtitle={`Wholesale · ${fmt(kpis.mtdD2c)} D2C`}
          color="sky"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-400" />
          Wholesale
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-pink-400" />
          D2C
        </span>
      </div>

      {/* Daily log — newest day first */}
      <div className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white px-4">
        {days.map((day) => (
          <DayRow key={day.dateKey} day={day} maxRevenue={kpis.bestDayRevenue} />
        ))}
      </div>
    </div>
  );
}
