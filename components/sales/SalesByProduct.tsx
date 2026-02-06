"use client";

import { Table } from "@/components/sales/Table";
import { TableRow } from "@/components/sales/TableRow";
import { SalesByProductMonth } from "./useSalesProductMonth.js";

export function SalesByProductMonthTable({
  rows,
}: {
  rows: SalesByProductMonth[];
}) {
  return (
    <section className="border border-gray-200 rounded-2xl p-6">
      <h2 className="text-lg font-medium mb-4">
        Sales by Product (Monthly)
      </h2>

      <Table>
        {rows.map((r) => (
          <TableRow
            key={`${r.month}-${r.product_code}`}
            name={`${r.display_name ?? r.product_code} · ${r.fragrance ?? "—"}`}
            value={`$${r.revenue.toFixed(2)}`}
            secondary={`${r.units_sold} units · ${r.month}`}
          />
        ))}
      </Table>
    </section>
  );
}
