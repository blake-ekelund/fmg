"use client";

import clsx from "clsx";
import { InventoryRow } from "../types";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  return (
    <>
      {/* ─── Mobile Cards ─── */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => {
          const isShort = r.short > 0;
          return (
            <div
              key={r.id}
              className={clsx(
                "rounded-xl border bg-white p-4 space-y-3",
                isShort ? "border-red-200 bg-red-50/30" : "border-gray-200"
              )}
            >
              <div>
                <div className="font-medium text-sm text-gray-900">{r.part}</div>
                {r.description && (
                  <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                <MobileStat label="On Hand" value={r.on_hand} />
                <MobileStat label="Available" value={r.available} />
                <MobileStat label="On Order" value={r.on_order} />
                <MobileStat label="Allocated" value={r.allocated} />
                <MobileStat label="Committed" value={r.committed} />
                <MobileStat label="Short" value={r.short} danger={isShort} />
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No inventory data available.
          </div>
        )}
      </div>

      {/* ─── Desktop Table ─── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Part</th>
              <th className="px-4 py-3 text-right font-medium">On Hand</th>
              <th className="px-4 py-3 text-right font-medium">Allocated</th>
              <th className="px-4 py-3 text-right font-medium">Available</th>
              <th className="px-4 py-3 text-right font-medium">On Order</th>
              <th className="px-4 py-3 text-right font-medium">Committed</th>
              <th className="px-4 py-3 text-right font-medium">Short</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isShort = r.short > 0;
              return (
                <tr
                  key={r.id}
                  className={clsx(
                    "transition hover:bg-gray-50",
                    idx !== rows.length - 1 && "border-b border-gray-100",
                    isShort && "bg-red-50/40"
                  )}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700">{r.part}</span>
                    {r.description && (
                      <span className="ml-2 text-xs text-gray-400">{r.description}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(r.on_hand)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(r.allocated)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(r.available)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(r.on_order)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{fmt(r.committed)}</td>
                  <td className={clsx(
                    "px-4 py-3 text-right tabular-nums font-medium",
                    isShort ? "text-red-600" : "text-gray-300"
                  )}>
                    {isShort ? fmt(r.short) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            No inventory data available.
          </div>
        )}
      </div>
    </>
  );
}

function MobileStat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={clsx("text-sm tabular-nums font-medium", danger ? "text-red-600" : "text-gray-900")}>
        {value > 0 || danger ? fmt(value) : "—"}
      </div>
    </div>
  );
}
