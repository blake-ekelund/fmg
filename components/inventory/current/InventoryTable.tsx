"use client";

import { InventoryRow } from "../types";

export default function InventoryTable({
  rows,
}: {
  rows: InventoryRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="px-4 py-3 text-left font-medium">
              Part
            </th>
            <th className="px-4 py-3 text-right font-medium">
              On Hand
            </th>
            <th className="px-4 py-3 text-right font-medium">
              Allocated
            </th>
            <th className="px-4 py-3 text-right font-medium">
              Available
            </th>
            <th className="px-4 py-3 text-right font-medium">
              On Order
            </th>
            <th className="px-4 py-3 text-right font-medium">
              Committed
            </th>
            <th className="px-4 py-3 text-right font-medium">
              Short
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={r.id}
              className={`
                transition
                hover:bg-gray-50
                ${idx !== rows.length - 1 ? "border-b border-gray-100" : ""}
              `}
            >
              {/* Part */}
              <td className="px-4 py-3 font-mono text-xs text-gray-700">
                {r.part}
              </td>

              {/* On Hand */}
              <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                {r.on_hand}
              </td>

              {/* Allocated */}
              <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                {r.allocated}
              </td>

              {/* Available */}
              <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                {r.available}
              </td>

              {/* On Order */}
              <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                {r.on_order}
              </td>

              {/* Committed */}
              <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                {r.committed}
              </td>

              {/* Short */}
              <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">
                {r.short}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="p-6 text-sm text-gray-500">
          No inventory data available.
        </div>
      )}
    </div>
  );
}
