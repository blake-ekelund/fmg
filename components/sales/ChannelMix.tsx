"use client";

import { useMemo } from "react";
import { Building2, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import ChartCard from "./ChartCard";
import { ChannelMixChart } from "./ChannelMixChart";
import { useChannelSales, totalsFor } from "./useChannelSales";
import { fmtMoney, formatMonthLabel, getTrailingMonths, pctChange } from "./constants";

/** The same 12 slots a year earlier, so the window can be compared to itself. */
function priorMonths(months: string[]) {
  return months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    return `${y - 1}-${String(mo).padStart(2, "0")}-01`;
  });
}

/**
 * Wholesale vs D2C for the page's trailing-12 window.
 *
 * Deliberately outside the product search: the split comes from the channel
 * RPC at order level, which has no product dimension, so it can't honour a SKU
 * filter. Saying so in the caption beats silently showing whole-business
 * numbers under a narrowed page.
 */
export default function ChannelMix({
  year,
  month,
}: {
  /** End of the trailing-12 window (1-based month), same as the rest of the page. */
  year: number;
  month: number;
}) {
  const { seriesFor, coverageStart, loading, error } = useChannelSales();

  const months = useMemo(() => getTrailingMonths(year, month), [year, month]);
  const series = useMemo(() => seriesFor(months), [seriesFor, months]);
  const prior = useMemo(
    () => seriesFor(priorMonths(months)),
    [seriesFor, months],
  );

  const current = totalsFor(series);
  const previous = totalsFor(prior);

  // Only compare against a prior window the source fully covers — a partial
  // baseline makes every delta look like growth.
  const comparable = previous.complete && previous.total > 0;
  const wholesaleDelta = comparable ? pctChange(current.wholesale, previous.wholesale) : null;
  const d2cDelta = comparable ? pctChange(current.d2c, previous.d2c) : null;

  const missing = series.filter((m) => m.wholesale == null).length;

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-xs text-gray-500">
        Channel split unavailable: {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          Loading channel split…
        </div>
      </div>
    );
  }

  if (current.coveredMonths === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-xs text-gray-500">
        No channel data for this window
        {coverageStart
          ? ` — the split starts at ${formatMonthLabel(coverageStart)}.`
          : "."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-3">
        <ChannelCard
          label="Wholesale"
          value={current.wholesale}
          share={current.wholesaleShare}
          delta={wholesaleDelta}
          icon={<Building2 size={13} />}
        />
        <ChannelCard
          label="D2C"
          value={current.d2c}
          share={current.d2cShare}
          delta={d2cDelta}
          icon={<ShoppingBag size={13} />}
        />
        {!comparable && (
          <p className="text-[10px] leading-relaxed text-gray-400">
            No year-over-year comparison: the channel source
            {coverageStart ? ` starts at ${formatMonthLabel(coverageStart)}` : ""},
            so the prior 12 months aren&apos;t fully covered.
          </p>
        )}
      </div>

      <div className="lg:col-span-2">
        <ChartCard
          title="D2C vs Wholesale — Monthly Revenue"
          caption={
            missing > 0
              ? `${12 - missing} of 12 months covered · all products`
              : "All products — not filtered by the search above"
          }
          bodyClassName="min-h-72"
        >
          <ChannelMixChart series={series} />
        </ChartCard>
      </div>
    </div>
  );
}

/* ─── Channel summary card ─── */

function ChannelCard({
  label,
  value,
  share,
  delta,
  icon,
}: {
  label: string;
  value: number;
  share: number | null;
  /** Fractional change vs the same window a year earlier; null when unfair. */
  delta: number | null;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
          {icon}
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          {label} TTM
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-gray-900">${fmtMoney(value)}</span>
        {delta != null && (
          <span
            title="vs. the same 12 months a year earlier"
            className={clsx(
              "text-[11px] font-medium tabular-nums",
              delta >= 0 ? "text-green-700" : "text-red-600",
            )}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
      {share != null && (
        <div className="mt-0.5 text-[10px] text-gray-400">
          {Math.round(share * 100)}% of TTM revenue
        </div>
      )}
    </div>
  );
}
