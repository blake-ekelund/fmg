"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSalesTTM } from "./useSalesTTM";
import { Trailing12MonthMatrix } from "./TTMMatrix";
import { SalesFilters } from "./SalesFilters";
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

/* ---------- PAGE ---------- */

export default function SalesPage() {
  const params = useSearchParams();

  const query = params.get("q") ?? "";
  const year = Number(params.get("year")) || new Date().getFullYear();
  const month = Number(params.get("month")) || new Date().getMonth() + 1;

  const { rows, loading } = useSalesTTM(query, year, month);
  const months = getTrailingMonths(year, month);

  const [mode, setMode] = useState<MatrixMode>("products");

  /* ---------- BUILD CHART SERIES (MODE + FILTER AWARE) ---------- */

  const seriesMap: Record<
    string,
    { label: string; byMonth: Record<string, number> }
  > = {};

  rows.forEach((r) => {
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
      (seriesMap[key].byMonth[r.month] ?? 0) +
      r.revenue;
  });

  const series = Object.values(seriesMap);

  const chartSeries =
    mode === "products"
      ? series
          .sort(
            (a, b) =>
              rowTTM(months, b.byMonth) -
              rowTTM(months, a.byMonth)
          )
          .slice(0, 15)
      : [
          ...series.filter((s) => s.label !== "Other"),
          ...series.filter((s) => s.label === "Other"),
        ];

  /* ---------- RENDER ---------- */

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="text-sm text-gray-500">
          Trailing 12-month revenue
        </p>
      </header>

      {/* FILTERS */}
      <SalesFilters />

      {/* MODE TOGGLE */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("products")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${
            mode === "products"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white border-gray-200"
          }`}
        >
          Top 15 Products
        </button>

        <button
          onClick={() => setMode("fragrances")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${
            mode === "fragrances"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white border-gray-200"
          }`}
        >
          Fragrance Mix
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : chartSeries.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No data matches the current filters.
        </div>
      ) : (
        <>
          {/* CHARTS */}
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

            <TTMStackedBars
              months={months}
              products={chartSeries}
            />
          </div>

          {/* MATRIX (FLIPS WITH MODE) */}
          <Trailing12MonthMatrix
            rows={rows}
            mode={mode}
            endYear={year}
            endMonth={month}
          />
        </>
      )}
    </div>
  );
}
