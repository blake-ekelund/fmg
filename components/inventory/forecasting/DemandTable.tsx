"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Loader2, RotateCcw } from "lucide-react";
import { addMonths, describeDemand, type DemandProfile } from "@/lib/seasonalDemand";
import type { ForecastRow } from "./types";

/**
 * Inventory → Demand view: expected units per SKU for each of the next 12
 * months, editable. A typed number becomes a hand-set override for that SKU and
 * month. It's saved, applied everywhere the forecast is used, and kept until
 * someone resets it (the cell's ↺, or "Reset SKU" for every month at once).
 */

const BASIS: Record<DemandProfile["method"], string> = {
  seasonal: "Seasonal",
  manual: "Typed avg",
  recent: "Last 90 days",
};

function monthLabel(key: string, withYear: boolean): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
  });
}

/** A flat profile for a row the demand service didn't answer for. */
function flat(row: ForecastRow, start: string): DemandProfile {
  const a = Math.max(0, row.avg_monthly_demand || 0);
  return {
    method: "manual",
    monthly: Array(12).fill(a),
    avg: a,
    trend: null,
    productTrend: null,
    brandTrend: null,
    last12: null,
    startMonth: start,
  };
}

export default function DemandTable({
  rows,
  startMonth,
  saving,
  onSet,
  onReset,
  onRowClick,
}: {
  rows: ForecastRow[];
  /** yyyy-mm of the first column (this month). */
  startMonth: string;
  /** "part|i" keys currently saving ("part|*" = whole SKU). */
  saving: Set<string>;
  onSet: (part: string, monthIndex: number, units: number) => void;
  /** monthIndex undefined = every month for the SKU. */
  onReset: (part: string, monthIndex?: number) => void;
  onRowClick: (part: string) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startMonth, i));
  const totals = Array(12).fill(0) as number[];
  for (const r of rows) {
    const p = r.demand ?? flat(r, startMonth);
    p.monthly.forEach((v, i) => (totals[i] += Math.round(v)));
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium">Product</th>
            <th className="px-2 py-2 text-left font-medium">Basis</th>
            {months.map((m, i) => (
              <th key={m} className="px-1.5 py-2 text-right font-medium tabular-nums">
                {monthLabel(m, i === 0 || m.endsWith("-01"))}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">12-mo</th>
            <th className="w-[1%] px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const p = r.demand ?? flat(r, startMonth);
            const hasOverrides = !!p.overridden?.some(Boolean);
            const total = p.monthly.reduce((a, v) => a + Math.round(v), 0);
            return (
              <tr key={r.part} className="group hover:bg-gray-50/60">
                <td className="sticky left-0 z-10 max-w-[16rem] bg-white px-3 py-1.5 group-hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => onRowClick(r.part)}
                    className="block max-w-full text-left"
                    title="Open the product"
                  >
                    <span className="block truncate font-mono text-xs text-gray-900">{r.part}</span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {r.display_name || r.fragrance || ""}
                    </span>
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-gray-500" title={describeDemand(p)}>
                  {r.demand ? BASIS[p.method] : "Flat"}
                </td>
                {months.map((m, i) => (
                  <DemandCell
                    key={m}
                    value={p.monthly[i] ?? 0}
                    base={p.base?.[i]}
                    overridden={!!p.overridden?.[i]}
                    saving={saving.has(`${r.part}|${i}`) || saving.has(`${r.part}|*`)}
                    monthName={monthLabel(m, true)}
                    onCommit={(v) => onSet(r.part, i, v)}
                    onReset={() => onReset(r.part, i)}
                  />
                ))}
                <td className="px-2 py-1.5 text-right font-medium tabular-nums text-gray-900">
                  {total.toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {hasOverrides ? (
                    <button
                      type="button"
                      onClick={() => onReset(r.part)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-white hover:text-gray-900"
                      title="Put every month for this SKU back on the forecast"
                    >
                      <RotateCcw size={11} /> Reset SKU
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 text-xs font-medium text-gray-700">
            <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Total ({rows.length} SKUs)</td>
            <td />
            {totals.map((t, i) => (
              <td key={i} className="px-1.5 py-2 text-right tabular-nums">
                {t.toLocaleString()}
              </td>
            ))}
            <td className="px-2 py-2 text-right tabular-nums">
              {totals.reduce((a, b) => a + b, 0).toLocaleString()}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DemandCell({
  value,
  base,
  overridden,
  saving,
  monthName,
  onCommit,
  onReset,
}: {
  value: number;
  base?: number;
  overridden: boolean;
  saving: boolean;
  monthName: string;
  onCommit: (units: number) => void;
  onReset: () => void;
}) {
  const shown = Math.round(value);
  const [draft, setDraft] = useState(String(shown));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(shown));
  }, [shown]);

  function commit() {
    editing.current = false;
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || !Number.isFinite(n) || n < 0) {
      setDraft(String(shown));
      return;
    }
    if (n !== shown) onCommit(n);
  }

  const forecast = base !== undefined ? Math.round(base) : shown;
  return (
    <td className="px-0.5 py-1">
      <div
        className={clsx(
          "group/cell relative flex items-center rounded-md border",
          overridden ? "border-amber-300 bg-amber-50" : "border-transparent hover:border-gray-200",
        )}
        title={
          overridden
            ? `${monthName}: set by hand to ${shown.toLocaleString()} (forecast ${forecast.toLocaleString()}). Stays until reset.`
            : `${monthName}: forecast ${shown.toLocaleString()}. Type a number to override it.`
        }
      >
        <input
          inputMode="numeric"
          value={draft}
          onFocus={(e) => {
            editing.current = true;
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              editing.current = false;
              setDraft(String(shown));
              e.currentTarget.blur();
            }
          }}
          aria-label={`Demand for ${monthName}`}
          className={clsx(
            "w-full min-w-[3.25rem] bg-transparent px-1.5 py-1 text-right tabular-nums outline-none focus:rounded-md focus:ring-2 focus:ring-gray-300",
            overridden ? "font-medium text-amber-900" : "text-gray-800",
          )}
        />
        {saving ? (
          <Loader2 size={10} className="absolute -right-0.5 -top-1 animate-spin text-gray-400" />
        ) : overridden ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onReset}
            aria-label={`Reset ${monthName} to the forecast (${forecast})`}
            title={`Reset to the forecast (${forecast.toLocaleString()})`}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 place-items-center rounded-full border border-amber-300 bg-white text-amber-700 shadow-sm group-hover/cell:grid"
          >
            <RotateCcw size={9} />
          </button>
        ) : null}
      </div>
    </td>
  );
}
