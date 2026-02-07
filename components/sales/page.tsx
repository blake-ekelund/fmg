"use client";

import { useSearchParams } from "next/navigation";
import { useSalesTTM } from "./useSalesTTM";
import { Trailing12MonthMatrix } from "./TTMMatrix";
import { SalesFilters } from "./SalesFilters";
import { TTMTreemap } from "./TTMTreemap";
import { TTMStackedBars } from "./TTMStackedBars";

/* ---------- HELPERS ---------- */

function ym(year: number, jsMonth: number) {
  return `${year}-${String(jsMonth + 1).padStart(2, "0")}-01`;
}

function getTrailingMonths(endYear: number, endMonth: number /* 1–12 */) {
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

export default function SalesPage() {
  const params = useSearchParams();

  const query = params.get("q") ?? "";
  const year =
    Number(params.get("year")) || new Date().getFullYear();
  const month =
    Number(params.get("month")) ||
    new Date().getMonth() + 1;

  const { rows, loading } = useSalesTTM(query, year, month);

  const months = getTrailingMonths(year, month);

  /* ---------- BUILD PRODUCT SERIES ---------- */

  const productsMap: Record<
    string,
    { label: string; byMonth: Record<string, number> }
  > = {};

  rows.forEach((r) => {
    const label = r.display_name ?? "Unknown";
    if (!productsMap[label]) {
      productsMap[label] = { label, byMonth: {} };
    }
    productsMap[label].byMonth[r.month] =
      (productsMap[label].byMonth[r.month] ?? 0) +
      r.revenue;
  });

  const products = Object.values(productsMap);

  const top15 = products
    .sort(
      (a, b) =>
        rowTTM(months, b.byMonth) -
        rowTTM(months, a.byMonth)
    )
    .slice(0, 15);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="text-sm text-gray-500">
          Trailing 12-month revenue
        </p>
      </header>

      <SalesFilters />

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <>
          {/* 50 / 50 CHART ROW */}
          {!query && top15.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TTMTreemap
                items={top15.map((p) => ({
                  name: p.label,
                  value: rowTTM(months, p.byMonth),
                }))}
              />

              <TTMStackedBars
                months={months}
                products={top15}
              />
            </div>
          )}

          <Trailing12MonthMatrix
            rows={rows}
            isFiltered={Boolean(query)}
            endYear={year}
            endMonth={month}
          />
        </>
      )}
    </div>
  );
}
