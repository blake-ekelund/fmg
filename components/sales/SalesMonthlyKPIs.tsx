"use client";

import { Stat } from "@/components/sales/Stat";
import { SalesProductMonth } from "./useSalesProductMonth";

export function SalesMonthlyKPIs({
  rows,
}: {
  rows: SalesProductMonth[];
}) {
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalUnits = rows.reduce((s, r) => s + r.units_sold, 0);

  const months = new Set(rows.map((r) => r.month)).size;
  const avgMonthlyRevenue =
    months > 0 ? totalRevenue / months : 0;

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <Stat label="Total Sales" value={`$${totalRevenue.toFixed(2)}`} />
      <Stat label="Units Sold" value={totalUnits.toLocaleString()} />
      <Stat
        label="Avg Monthly Sales"
        value={`$${avgMonthlyRevenue.toFixed(2)}`}
      />
      <Stat label="Months Covered" value={months.toString()} />
    </section>
  );
}
