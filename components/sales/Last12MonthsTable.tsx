"use client";

import { Table } from "@/components/sales/Table";
import { TableRow } from "@/components/sales/TableRow";

type Row = {
  month: string;
  revenue: number;
};

export function Last12MonthsTable({ rows }: { rows: Row[] }) {
  return (
    <section className="border border-gray-200 rounded-2xl p-6">
      <h2 className="text-lg font-medium mb-4">
        Last 12 Months
      </h2>

      <Table>
        {rows.map(r => (
          <TableRow
            key={r.month}
            name={r.month}
            value={`$${r.revenue.toFixed(2)}`}
          />
        ))}
      </Table>
    </section>
  );
}
