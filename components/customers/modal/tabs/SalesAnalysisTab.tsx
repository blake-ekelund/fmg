"use client";

import { useMemo } from "react";
import { formatMoney } from "../utils/format";
import type { AnalysisRow } from "../hooks/useCustomerSalesAnalysis";

export default function SalesAnalysisTab({
  data,
  loading,
}: {
  data: AnalysisRow[];
  loading: boolean;
}) {
  const years = [2026, 2025, 2024];

  /* -------------------------------------------------- */
  /* Remove SHIPPING rows once, globally                */
  /* -------------------------------------------------- */

  const filteredData = useMemo(() => {
    return data.filter((r) => {
      const product = r.display_name?.toLowerCase() ?? "";
      const fragrance = r.fragrance?.toLowerCase() ?? "";
      return !product.includes("shipping") && !fragrance.includes("shipping");
    });
  }, [data]);

  /* -------------------------------------------------- */
  /* Year Totals (for % of total math)                  */
  /* -------------------------------------------------- */

  const yearTotals = useMemo(() => {
    const totals: Record<number, number> = {};

    filteredData.forEach((r) => {
      totals[r.year] = (totals[r.year] ?? 0) + r.revenue;
    });

    return totals;
  }, [filteredData]);

  /* -------------------------------------------------- */
  /* Pivot Builder                                      */
  /* -------------------------------------------------- */

  function buildPivot(
    key: "fragrance" | "display_name"
  ): {
    name: string;
    values: Record<number, number>;
    total: number;
  }[] {
    const map = new Map<string, Record<number, number>>();

    filteredData.forEach((r) => {
      const name = (r[key] ?? "Uncategorized").trim();

      if (!map.has(name)) {
        map.set(name, {});
      }

      const yearMap = map.get(name)!;
      yearMap[r.year] = (yearMap[r.year] ?? 0) + r.revenue;
    });

    return Array.from(map.entries())
      .map(([name, values]) => {
        const total = years.reduce(
          (sum, year) => sum + (values[year] ?? 0),
          0
        );

        return { name, values, total };
      })
      .filter((row) =>
        years.some((year) => (row.values[year] ?? 0) !== 0)
      )
      .sort(
        (a, b) =>
          (b.values[2026] ?? 0) - (a.values[2026] ?? 0)
      );
  }

  const fragrancePivot = useMemo(
    () => buildPivot("fragrance"),
    [filteredData]
  );

  const productPivot = useMemo(
    () => buildPivot("display_name"),
    [filteredData]
  );

  /* -------------------------------------------------- */
  /* Grand Total Across Years                           */
  /* -------------------------------------------------- */

  const grandTotal = years.reduce(
    (sum, year) => sum + (yearTotals[year] ?? 0),
    0
  );

  if (loading) {
    return (
      <div className="text-sm text-slate-400">
        Loading sales analysis...
      </div>
    );
  }

  if (!filteredData.length) {
    return (
      <div className="text-sm text-slate-400">
        No sales data found.
      </div>
    );
  }

  /* -------------------------------------------------- */
  /* Reusable Table Renderer                            */
  /* -------------------------------------------------- */

  function renderTable(
    title: string,
    rows: {
      name: string;
      values: Record<number, number>;
      total: number;
    }[]
  ) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          {title}
        </h3>

        <div className="overflow-auto border border-slate-200 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3 px-4 text-left">
                  {title.includes("Fragrance")
                    ? "Fragrance"
                    : "Product"}
                </th>

                {years.map((year) => (
                  <th key={year} className="py-3 px-4 text-right">
                    {year}
                  </th>
                ))}

                <th className="py-3 px-4 text-right font-semibold">
                  Total
                </th>

                {years.map((year) => (
                  <th
                    key={`${year}-pct`}
                    className="py-3 px-4 text-right"
                  >
                    % {year}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className="border-t border-slate-100"
                >
                  <td className="py-2 px-4 font-medium">
                    {row.name}
                  </td>

                  {years.map((year) => (
                    <td
                      key={year}
                      className="py-2 px-4 text-right"
                    >
                      {formatMoney(row.values[year] ?? 0)}
                    </td>
                  ))}

                  <td className="py-2 px-4 text-right font-semibold">
                    {formatMoney(row.total)}
                  </td>

                  {years.map((year) => {
                    const value = row.values[year] ?? 0;
                    const total = yearTotals[year] ?? 0;
                    const pct = total ? value / total : 0;

                    return (
                      <td
                        key={`${year}-pct`}
                        className="py-2 px-4 text-right text-slate-500"
                      >
                        {(pct * 100).toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* GRAND TOTAL ROW */}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="py-2 px-4">Grand Total</td>

                {years.map((year) => (
                  <td
                    key={`gt-${year}`}
                    className="py-2 px-4 text-right"
                  >
                    {formatMoney(yearTotals[year] ?? 0)}
                  </td>
                ))}

                <td className="py-2 px-4 text-right">
                  {formatMoney(grandTotal)}
                </td>

                {years.map((year) => (
                  <td
                    key={`gt-${year}-pct`}
                    className="py-2 px-4 text-right"
                  >
                    100%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /* -------------------------------------------------- */

  return (
    <div className="space-y-12">
      {renderTable("Sales by Fragrance", fragrancePivot)}
      {renderTable("Sales by Product", productPivot)}
    </div>
  );
}