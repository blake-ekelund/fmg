"use client";

import { useMemo, useState } from "react";
import { useSalesByMonth } from "@/components/sales/useSalesByMonth";
import { useSalesProductMonth } from "@/components/sales/useSalesProductMonth";
import { ProductFilters } from "@/components/sales/ProductFilters";
import { SalesYearComparisonChart } from "@/components/sales/SalesYearComparisonChart";
import { Last12MonthsTable } from "@/components/sales/Last12MonthsTable";

/* ---------------------------------------------
   Helpers
--------------------------------------------- */
function monthKey(d: string | Date) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

export default function SalesPage() {
  // 🔹 Hooks must ALWAYS run
  const monthData = useSalesByMonth();
  const productData = useSalesProductMonth();

  const [product, setProduct] = useState("");
  const [fragrance, setFragrance] = useState("");

  /* ---------------------------------------------
     Derived data (hooks FIRST, no early return)
  --------------------------------------------- */
  const products = useMemo(
    () =>
      Array.from(
        new Set(
          productData.rows.map(r => r.display_name).filter(Boolean)
        )
      ) as string[],
    [productData.rows]
  );

  const fragrances = useMemo(
    () =>
      Array.from(
        new Set(
          productData.rows.map(r => r.fragrance).filter(Boolean)
        )
      ) as string[],
    [productData.rows]
  );

  const now = new Date();
  const currentYear = now.getFullYear();
  const priorYear = currentYear - 1;

  const monthLabels = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec"
  ];

  const currentYearData = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) =>
      monthData.rows
        .filter(r => {
          const d = new Date(r.month);
          return d.getFullYear() === currentYear && d.getMonth() === m;
        })
        .reduce((s, r) => s + r.revenue, 0)
    );
  }, [monthData.rows, currentYear]);

  const priorYearData = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) =>
      monthData.rows
        .filter(r => {
          const d = new Date(r.month);
          return d.getFullYear() === priorYear && d.getMonth() === m;
        })
        .reduce((s, r) => s + r.revenue, 0)
    );
  }, [monthData.rows, priorYear]);

  const last12 = useMemo(() => {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - 11,
      1
    );

    const revenueByMonth = monthData.rows.reduce<Record<string, number>>(
      (acc, r) => {
        const key = monthKey(r.month);
        acc[key] = (acc[key] ?? 0) + r.revenue;
        return acc;
      },
      {}
    );

    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(
        start.getFullYear(),
        start.getMonth() + i,
        1
      );
      const key = monthKey(d);

      return {
        month: `${key}-01`,
        revenue: revenueByMonth[key] ?? 0,
      };
    });
  }, [monthData.rows, now]);

  /* ---------------------------------------------
     NOW it is safe to conditionally render
  --------------------------------------------- */
  if (monthData.loading || productData.loading) {
    return (
      <div className="px-8 py-10 text-gray-500">
        Loading sales…
      </div>
    );
  }

  return (
    <div className="px-8 py-10 space-y-12">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">
          Sales
        </h1>
        <p className="mt-3 text-gray-500 max-w-xl">
          Monthly sales performance.
        </p>
      </header>

      <ProductFilters
        products={products}
        fragrances={fragrances}
        selectedProduct={product}
        selectedFragrance={fragrance}
        onProductChange={setProduct}
        onFragranceChange={setFragrance}
      />

      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-4">
          Monthly Sales: {priorYear} vs {currentYear}
        </h2>

        <SalesYearComparisonChart
          months={monthLabels}
          priorYear={priorYear}
          currentYear={currentYear}
          priorYearData={priorYearData}
          currentYearData={currentYearData}
        />
      </section>

      <Last12MonthsTable rows={last12} />
    </div>
  );
}
