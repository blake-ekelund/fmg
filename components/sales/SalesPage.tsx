"use client";

import { useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
import { Search, DollarSign, TrendingUp, Package, Layers } from "lucide-react";
import clsx from "clsx";
import { useSalesTTM } from "./useSalesTTM";
import { Trailing12MonthMatrix } from "./TTMMatrix";
import { TTMTreemap } from "./TTMTreemap";
import { TTMStackedBars } from "./TTMStackedBars";

export type MatrixMode = "products" | "fragrances";

/* ---------- FRAGRANCE WHITELIST ---------- */

const ALLOWED_FRAGRANCES = new Set([
  "Sea Salt",
  "Grapefruit",
  "Lavender",
  "Eucalyptus",
  "Coconut",
  "Agave Pear",
  "Cypres",
]);

/* ---------- HELPERS ---------- */

function ym(year: number, jsMonth: number) {
  return `${year}-${String(jsMonth + 1).padStart(2, "0")}-01`;
}

function getTrailingMonths(endYear: number, endMonth: number) {
  const months: string[] = [];
  let y = endYear;
  let m = endMonth - 1;

  for (let i = 0; i < 12; i++) {
    months.push(ym(y, m));
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }

  return months.reverse();
}

function rowTTM(
  months: string[],
  byMonth: Record<string, number>
) {
  return months.reduce(
    (sum, m) => sum + (byMonth[m] ?? 0),
    0
  );
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/* ---------- PAGE ---------- */

export default function SalesPage() {
  const params = useSearchParams();
  const now = new Date();

  const urlQuery = params.get("q") ?? "";
  const year = Number(params.get("year")) || now.getFullYear();
  const month = Number(params.get("month")) || now.getMonth() + 1;

  // Search is purely client-side — the server query doesn't take it,
  // so changing the input never triggers a refetch.
  const { rows, loading } = useSalesTTM(year, month);
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
    window.history.replaceState(null, "", `/sales?${p.toString()}`);
  }

  /* ---------- CLIENT-SIDE SEARCH FILTER ---------- */

  const filteredRows = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const pnum = (r.productnum || "").toLowerCase();
      const name = (r.display_name || "").toLowerCase();
      const frag = (r.fragrance || "").toLowerCase();
      return pnum.includes(q) || name.includes(q) || frag.includes(q);
    });
  }, [rows, localSearch]);

  /* ---------- BUILD CHART SERIES ---------- */

  const chartSeries = useMemo(() => {
    const seriesMap: Record<
      string,
      { label: string; byMonth: Record<string, number> }
    > = {};

    filteredRows.forEach((r) => {
      let key: string;
      if (mode === "products") {
        key = r.display_name ?? "Unknown";
      } else {
        const f = r.fragrance ?? "—";
        key = ALLOWED_FRAGRANCES.has(f) ? f : "Other";
      }
      if (!seriesMap[key]) {
        seriesMap[key] = { label: key, byMonth: {} };
      }
      seriesMap[key].byMonth[r.month] =
        (seriesMap[key].byMonth[r.month] ?? 0) + r.revenue;
    });

    const series = Object.values(seriesMap);

    return mode === "products"
      ? series
          .sort((a, b) => rowTTM(months, b.byMonth) - rowTTM(months, a.byMonth))
          .slice(0, 15)
      : [
          ...series.filter((s) => s.label !== "Other"),
          ...series.filter((s) => s.label === "Other"),
        ];
  }, [filteredRows, months, mode]);

  /* ---------- KPI summary ---------- */

  const kpis = useMemo(() => {
    const ttmTotal = filteredRows.reduce((s, r) => s + r.revenue, 0);
    const uniqueProducts = new Set(
      filteredRows.map((r) => r.display_name ?? r.productnum)
    ).size;
    const uniqueFragrances = new Set(
      filteredRows.map((r) => r.fragrance).filter(Boolean)
    ).size;
    const avgMonthly = ttmTotal / 12;
    return { ttmTotal, uniqueProducts, uniqueFragrances, avgMonthly };
  }, [filteredRows]);

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

      {/* ── KPI Summary Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="TTM Revenue"
          value={`$${fmtMoney(kpis.ttmTotal)}`}
          icon={<DollarSign size={13} />}
        />
        <KpiCard
          label="Avg Monthly"
          value={`$${fmtMoney(kpis.avgMonthly)}`}
          icon={<TrendingUp size={13} />}
        />
        <KpiCard
          label="Products"
          value={kpis.uniqueProducts.toLocaleString()}
          icon={<Package size={13} />}
        />
        <KpiCard
          label="Fragrances"
          value={kpis.uniqueFragrances.toLocaleString()}
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
      {isInitialLoad ? (
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
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TTMTreemap
              title={
                mode === "products"
                  ? "Top 15 Products — TTM Revenue Share"
                  : "Fragrance Mix — TTM Revenue Share"
              }
              items={chartSeries.map((s) => ({
                name: s.label,
                value: rowTTM(months, s.byMonth),
              }))}
            />
            <TTMStackedBars months={months} products={chartSeries} />
          </div>

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
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
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
      <div className="text-lg font-semibold text-gray-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}
