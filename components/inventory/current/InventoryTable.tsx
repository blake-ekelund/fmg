"use client";

import { InventoryRow } from "../types";

export default function InventoryTable({
  rows,
}: {
  rows: InventoryRow[];
}) {
  return (
    <>
      {/* ========================= */}
      {/* Mobile Card View */}
      {/* ========================= */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div
            key={r.id}
            className="
              rounded-2xl border border-gray-200 bg-white
              p-4 space-y-3
            "
          >
            {/* Header */}
            <div>
              <div className="font-mono text-xs text-gray-500">
                Part
              </div>
              <div className="font-medium text-gray-900">
                {r.part}
              </div>
            </div>

            {/* Quantities */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums">
              <Stat label="On Hand" value={r.on_hand} />
              <Stat label="Allocated" value={r.allocated} />
              <Stat label="Available" value={r.available} />
              <Stat label="On Order" value={r.on_order} />
              <Stat label="Committed" value={r.committed} />
              <Stat
                label="Short"
                value={r.short}
                danger
              />
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="p-4 text-sm text-gray-500">
            No inventory data available.
          </div>
        )}
      </div>

      {/* ========================= */}
      {/* Desktop Table View */}
      {/* ========================= */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 bg-white">
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
                  transition hover:bg-gray-50
                  ${
                    idx !== rows.length - 1
                      ? "border-b border-gray-100"
                      : ""
                  }
                `}
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-700">
                  {r.part}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                  {r.on_hand}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                  {r.allocated}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                  {r.available}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                  {r.on_order}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                  {r.committed}
                </td>

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
    </>
  );
}

/* ---------------------------------------------
   Small stat helper (mobile only)
--------------------------------------------- */
function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">
        {label}
      </div>
      <div
        className={
          danger
            ? "font-medium text-red-600"
            : "text-gray-900"
        }
      >
        {value}
      </div>
    </div>
  );
}
