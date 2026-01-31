"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Product } from "../types";

type ForecastRow = Product & {
  on_hand: number;
  on_order: number;
};

function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/* ---------------------------------------------
   Group rows by Display Name + Product Type
--------------------------------------------- */
function groupByProduct(rows: ForecastRow[]) {
  const groups = new Map<string, ForecastRow[]>();

  for (const row of rows) {
    const key = `${row.display_name}__${row.product_type}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(
    ([key, items]) => {
      const [name, type] = key.split("__");
      return { name, type, items };
    }
  );
}

export default function ForecastSection() {
  const [rows, setRows] = useState<ForecastRow[]>([]);

  useEffect(() => {
    async function load() {
      const { data: products } = await supabase
        .from("inventory_products")
        .select("*")
        .eq("is_forecasted", true);

      const { data: inventory } = await supabase
        .from("inventory_snapshot_items")
        .select("part, on_hand, on_order")
        .order("created_at", { ascending: false });

      const inventoryMap = new Map(
        (inventory ?? []).map((r) => [r.part, r])
      );

      const merged =
        products?.map((p) => ({
          ...p,
          on_hand: inventoryMap.get(p.part)?.on_hand ?? 0,
          on_order: inventoryMap.get(p.part)?.on_order ?? 0,
        })) ?? [];

      setRows(merged);
    }

    load();
  }, []);

  /* ---------------------------------------------
     Only next 6 months
  --------------------------------------------- */
  const months = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) =>
      addMonths(new Date(), i)
    );
  }, []);

  const grouped = useMemo(
    () => groupByProduct(rows),
    [rows]
  );

  function project(row: ForecastRow, monthIndex: number) {
    const arrivals =
      row.lead_time_months > 0 &&
      monthIndex === Math.floor(row.lead_time_months)
        ? row.on_order
        : 0;

    return (
      row.on_hand +
      arrivals -
      row.avg_monthly_demand * (monthIndex + 1)
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">
        Inventory Forecast (Next 6 Months)
      </h2>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 text-left">Part</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">On Hand</th>
              <th className="px-4 py-3 text-right">On Order</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3 text-right">Avg / Mo</th>

              {months.map((m) => (
                <th
                  key={m.toISOString()}
                  className="px-4 py-3 text-right"
                >
                  {m.toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                  })}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {grouped.map((group) => (
              <Fragment key={`${group.name}-${group.type}`}>
                {/* Group Header */}
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td
                    colSpan={6 + months.length}
                    className="px-4 py-3 text-sm font-medium text-gray-900"
                  >
                    {group.name}
                    <span className="ml-2 inline-flex items-center rounded-md bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {group.type}
                    </span>
                  </td>
                </tr>

                {/* Group Rows */}
                {group.items.map((r) => (
                  <tr
                    key={r.part}
                    className="border-b border-gray-100"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {r.part}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.display_name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.on_hand}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.on_order}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.min_qty}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.avg_monthly_demand}
                    </td>

                    {months.map((_, i) => {
                      const v = project(r, i);
                      const color =
                        v < 0
                          ? "bg-red-100 text-red-700"
                          : v < r.min_qty
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800";

                      return (
                        <td
                          key={i}
                          className={`px-4 py-3 text-right tabular-nums ${color}`}
                        >
                          {Math.round(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>

        {grouped.length === 0 && (
          <div className="p-6 text-sm text-gray-500">
            No forecastable products found.
          </div>
        )}
      </div>
    </div>
  );
}
