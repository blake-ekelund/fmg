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

  const years = [2026, 2025];

  const fragrancePivot = useMemo(() => {
    const map = new Map<string, Record<number, number>>();

    data.forEach((r) => {
      if (!map.has(r.fragrance)) {
        map.set(r.fragrance, {});
      }

      const yearMap = map.get(r.fragrance)!;
      yearMap[r.year] = (yearMap[r.year] ?? 0) + r.revenue;
    });

    return Array.from(map.entries())
      .map(([name, values]) => ({ name, values }))
      .filter(row =>
        years.some(year => (row.values[year] ?? 0) !== 0)
      )
      .sort((a, b) =>
        (b.values[2026] ?? 0) - (a.values[2026] ?? 0)
      );

  }, [data]);

  const productPivot = useMemo(() => {
    const map = new Map<string, Record<number, number>>();

    data.forEach((r) => {
      if (!map.has(r.display_name)) {
        map.set(r.display_name, {});
      }

      const yearMap = map.get(r.display_name)!;
      yearMap[r.year] = (yearMap[r.year] ?? 0) + r.revenue;
    });

    return Array.from(map.entries())
      .map(([name, values]) => ({ name, values }))
      .filter(row =>
        years.some(year => (row.values[year] ?? 0) !== 0)
      )
      .sort((a, b) =>
        (b.values[2026] ?? 0) - (a.values[2026] ?? 0)
      );

  }, [data]);

  if (loading) {
    return <div className="text-sm text-slate-400">Loading sales analysis...</div>;
  }

  if (!data.length) {
    return <div className="text-sm text-slate-400">No sales data found.</div>;
  }

  return (
    <div className="space-y-12">

      {/* FRAGRANCE */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          Sales by Fragrance
        </h3>

        <div className="overflow-auto border border-slate-200 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3 px-4 text-left">Fragrance</th>
                {years.map((year) => (
                  <th key={year} className="py-3 px-4 text-right">
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fragrancePivot.map((row, idx) => (
                <tr key={`f-${idx}`} className="border-t border-slate-100">
                  <td className="py-2 px-4 font-medium">{row.name}</td>
                  {years.map((year) => (
                    <td key={year} className="py-2 px-4 text-right">
                      {formatMoney(row.values[year] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PRODUCT */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          Sales by Product
        </h3>

        <div className="overflow-auto border border-slate-200 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3 px-4 text-left">Product</th>
                {years.map((year) => (
                  <th key={year} className="py-3 px-4 text-right">
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productPivot.map((row, idx) => (
                <tr key={`p-${idx}`} className="border-t border-slate-100">
                  <td className="py-2 px-4 font-medium">{row.name}</td>
                  {years.map((year) => (
                    <td key={year} className="py-2 px-4 text-right">
                      {formatMoney(row.values[year] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}