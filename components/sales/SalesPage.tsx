"use client";

import { useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
import { Search, DollarSign, TrendingUp, Package, Layers } from "lucide-react";
import clsx from "clsx";
import { useSalesTTM, type SalesMatrixRow } from "./useSalesTTM";
import { Trailing12MonthMatrix } from "./TTMMatrix";
import { TTMRankedBars } from "./TTMRankedBars";
import { TTMMonthlyTrend } from "./TTMMonthlyTrend";
import ChartCard from "./ChartCard";
import ChannelMix from "./ChannelMix";
import {
  ALLOWED_FRAGRANCES,
  CHANNEL_LABEL,
  OTHER_LABEL,
  TOP_PRODUCT_LIMIT,
  getTrailingMonths,
  rowTTM,
  fmtMoney,
  pctChange,
  type MatrixMode,
  type SalesChannel,
} from "./constants";

export type { MatrixMode };

/* ---------- PAGE ---------- */

export default function SalesPage({
  channel = "all",
}: {
  /** Which slice of the business this page reads. One component, three routes. */
  channel?: SalesChannel;
}) {
  const params = useSearchParams();
  const now = new Date();

  const urlQuery = params.get("q") ?? "";
  const year = Number(params.get("year")) || now.getFullYear();
  const month = Number(params.get("month")) || now.getMonth() + 1;

  // Search is purely client-side — the server query doesn't take it,
  // so changing the input never triggers a refetch.
  const { rows, priorRows, loading, channelUnavailable } = useSalesTTM(
    year,
    month,
    channel,
  );
  const months = getTrailingMonths(year, month);

  const [mode, setMode] = useState<MatrixMode>("products");
  const [localSearch, setLocalSearch] = useState(urlQuery);

  /* ---------- URL update for filters ---------- */

  function updateUrl(next: { q?: string; year?: number; month?: number }) {
    const p = new URLSearchParams(params.toString());
    if (next.q !== undefined) {
      if (next.q) p.set("q", next.q);
      else p.delete("q");
    }
    if (next.year !== undefined) p.set("year", String(next.year));
    if (next.month !== undefined) p.set("month", String(next.month));
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }

  /* ---------- CLIENT-SIDE SEARCH FILTER ---------- */

  // The same predicate runs over both windows, so a search term narrows the
  // baseline the KPI deltas are measured against too. Filtering only the
  // current year would compare a subset against the whole business.
  const matchesSearch = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    return (r: SalesMatrixRow) => {
      if (!q) return true;
      return (
        (r.productnum || "").toLowerCase().includes(q) ||
        (r.display_name || "").toLowerCase().includes(q) ||
        (r.fragrance || "").toLowerCase().includes(q)
      );
    };
  }, [localSearch]);

  const filteredRows = useMemo(
    () => rows.filter(matchesSearch),
    [rows, matchesSearch],
  );
  const filteredPriorRows = useMemo(
    () => priorRows.filter(matchesSearch),
    [priorRows, matchesSearch],
  );

  /* ---------- BUILD CHART SERIES ---------- */

  const chartSeries = useMemo(() => {
    const seriesKey = (r: SalesMatrixRow) => {
      if (mode === "products") return r.display_name ?? "Unknown";
      const f = r.fragrance ?? "—";
      return ALLOWED_FRAGRANCES.has(f) ? f : OTHER_LABEL;
    };

    const seriesMap: Record<
      string,
      { label: string; byMonth: Record<string, number> }
    > = {};

    filteredRows.forEach((r) => {
      const key = seriesKey(r);
      if (!seriesMap[key]) seriesMap[key] = { label: key, byMonth: {} };
      seriesMap[key].byMonth[r.month] =
        (seriesMap[key].byMonth[r.month] ?? 0) + r.revenue;
    });

    const series = Object.values(seriesMap);
    const byTTMDesc = (
      a: { byMonth: Record<string, number> },
      b: { byMonth: Record<string, number> },
    ) => rowTTM(months, b.byMonth) - rowTTM(months, a.byMonth);

    // Both modes rank by revenue; only "products" truncates. "Other" is always
    // last so it reads as the remainder rather than as another product.
    return mode === "products"
      ? series.sort(byTTMDesc).slice(0, TOP_PRODUCT_LIMIT)
      : [
          ...series.filter((s) => s.label !== OTHER_LABEL).sort(byTTMDesc),
          ...series.filter((s) => s.label === OTHER_LABEL),
        ];
  }, [filteredRows, months, mode]);

  /* Month totals for the trend chart — every filtered row, not just the top 15,
     so the bars agree with the matrix's "Total Sales" line underneath. */
  const currentByMonth = useMemo(() => {
    const acc: Record<string, number> = {};
    filteredRows.forEach((r) => {
      acc[r.month] = (acc[r.month] ?? 0) + r.revenue;
    });
    return acc;
  }, [filteredRows]);

  const priorByMonth = useMemo(() => {
    const acc: Record<string, number> = {};
    filteredPriorRows.forEach((r) => {
      acc[r.month] = (acc[r.month] ?? 0) + r.revenue;
    });
    return acc;
  }, [filteredPriorRows]);

  /* ---------- KPI summary, with year-over-year deltas ---------- */

  const kpis = useMemo(() => {
    const summarize = (rs: SalesMatrixRow[]) => ({
      total: rs.reduce((s, r) => s + r.revenue, 0),
      products: new Set(rs.map((r) => r.display_name ?? r.productnum)).size,
      fragrances: new Set(rs.map((r) => r.fragrance).filter(Boolean)).size,
      // Months that actually carry revenue. The trailing window runs to the
      // selected month, so dividing by a flat 12 understates the run rate
      // whenever the window has empty or partial months.
      activeMonths: new Set(rs.map((r) => r.month)).size,
    });

    const cur = summarize(filteredRows);
    const prev = summarize(filteredPriorRows);
    const hasPrior = filteredPriorRows.length > 0;

    const curAvg = cur.total / (cur.activeMonths || 1);
    const prevAvg = prev.total / (prev.activeMonths || 1);

    return {
      ttmTotal: cur.total,
      ttmDelta: hasPrior ? pctChange(cur.total, prev.total) : null,
      avgMonthly: curAvg,
      avgDelta: hasPrior ? pctChange(curAvg, prevAvg) : null,
      uniqueProducts: cur.products,
      productsDelta: hasPrior ? cur.products - prev.products : null,
      uniqueFragrances: cur.fragrances,
      fragrancesDelta: hasPrior ? cur.fragrances - prev.fragrances : null,
    };
  }, [filteredRows, filteredPriorRows]);

  // Only show the full-screen loading overlay on the very first load.
  // Subsequent month/year changes keep the old data visible and show a small inline indicator.
  const isInitialLoad = loading && rows.length === 0;

  /* ---------- RENDER ---------- */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto relative">
      {/* Inline refetch indicator (doesn't block or wipe old data) */}
      {loading && !isInitialLoad && (
        <div className="fixed top-16 right-4 z-20 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          <span className="text-[11px] font-medium text-gray-500">
            Updating…
          </span>
        </div>
      )}

      {/* ── Heading ── */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">
          Sales Analysis{channel === "all" ? "" : ` — ${CHANNEL_LABEL[channel]}`}
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          {channel === "all"
            ? "Every order, wholesale and D2C together"
            : channel === "wholesale"
              ? "Orders from wholesale accounts only"
              : "Orders from the D2C storefronts only"}
        </p>
      </div>

      {/* ── KPI Summary Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="TTM Revenue"
          value={`$${fmtMoney(kpis.ttmTotal)}`}
          delta={kpis.ttmDelta}
          icon={<DollarSign size={13} />}
        />
        <KpiCard
          label="Avg Monthly"
          value={`$${fmtMoney(kpis.avgMonthly)}`}
          delta={kpis.avgDelta}
          icon={<TrendingUp size={13} />}
        />
        <KpiCard
          label="Products"
          value={kpis.uniqueProducts.toLocaleString()}
          countDelta={kpis.productsDelta}
          icon={<Package size={13} />}
        />
        <KpiCard
          label="Fragrances"
          value={kpis.uniqueFragrances.toLocaleString()}
          countDelta={kpis.fragrancesDelta}
          icon={<Layers size={13} />}
        />
      </div>

      {/* ── Filters + Mode Toggle ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                updateUrl({ q: e.target.value });
              }}
              placeholder="Search SKU, product, fragrance…"
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
            />
          </div>

          {/* Month */}
          <select
            value={month}
            onChange={(e) => updateUrl({ month: Number(e.target.value) })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString("en-US", {
                  month: "long",
                })}
              </option>
            ))}
          </select>

          {/* Year */}
          <select
            value={year}
            onChange={(e) => updateUrl({ year: Number(e.target.value) })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
          >
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map(
              (y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              )
            )}
          </select>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Mode Toggle */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setMode("products")}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                mode === "products"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              Top 15 Products
            </button>
            <button
              onClick={() => setMode("fragrances")}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                mode === "fragrances"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              Fragrance Mix
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {channelUnavailable ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Layers size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="mb-1 text-sm font-medium text-gray-500">
            Channel breakdown isn&apos;t available yet
          </p>
          <p className="mx-auto max-w-md text-xs text-gray-400">
            This page reads <code>sales_by_product_month_channel</code>. Run the
            pending migration (<code>supabase db push</code>) to create it — the
            combined Sales Analysis page works either way.
          </p>
        </div>
      ) : isInitialLoad ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
            Loading sales data…
          </div>
        </div>
      ) : chartSeries.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Package size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500 mb-1">
            No data matches the current filters
          </p>
          <p className="text-xs text-gray-400">
            Try adjusting the search, date range, or brand filter.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Charts. `items-stretch` plus the h-full inside ChartCard keeps the
              two cards the same height regardless of their content. */}
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
            <ChartCard
              title={
                mode === "products"
                  ? "Top 15 Products — TTM Revenue"
                  : "Fragrance Mix — TTM Revenue"
              }
              caption="Share of TTM revenue"
            >
              <TTMRankedBars
                items={chartSeries.map((s) => ({
                  name: s.label,
                  value: rowTTM(months, s.byMonth),
                }))}
              />
            </ChartCard>

            <ChartCard
              title="Monthly Revenue"
              caption="vs. same month last year"
              bodyClassName="min-h-72"
            >
              <TTMMonthlyTrend
                months={months}
                currentByMonth={currentByMonth}
                priorByMonth={priorByMonth}
              />
            </ChartCard>
          </div>

          {/* Channel split — same window, cut by who bought rather than what.
              On a single-channel page it would just restate the header. */}
          {channel === "all" && <ChannelMix year={year} month={month} />}

          {/* Matrix */}
          <Trailing12MonthMatrix
            rows={filteredRows}
            mode={mode}
            endYear={year}
            endMonth={month}
          />
        </div>
      )}
    </div>
  );
}

/* ─── KPI Card ─── */

function KpiCard({
  label,
  value,
  delta,
  countDelta,
  icon,
}: {
  label: string;
  value: string;
  /** Fractional change vs the prior 12-month window (0.12 = +12%). */
  delta?: number | null;
  /** Absolute change, for counts where a percentage reads oddly. */
  countDelta?: number | null;
  icon: React.ReactNode;
}) {
  const shown =
    delta != null
      ? `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta * 100).toFixed(1)}%`
      : countDelta != null && countDelta !== 0
        ? `${countDelta > 0 ? "▲" : "▼"} ${Math.abs(countDelta)}`
        : null;

  const positive = (delta ?? countDelta ?? 0) >= 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gray-100 text-gray-500">
          {icon}
        </div>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-gray-900">{value}</span>
        {shown && (
          /* The arrow glyph carries the direction, so colour reinforces the
             sign rather than being the only way to read it. */
          <span
            title="vs. the prior 12-month window"
            className={clsx(
              "text-[11px] font-medium tabular-nums",
              positive ? "text-green-700" : "text-red-600"
            )}
          >
            {shown}
          </span>
        )}
      </div>
      {shown && (
        <div className="mt-0.5 text-[10px] text-gray-400">vs prior TTM</div>
      )}
    </div>
  );
}
