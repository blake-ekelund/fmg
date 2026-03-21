import { useMemo, useState, useEffect } from "react";
import clsx from "clsx";
import ForecastRow from "./ForecastRow";
import { ForecastRow as Row } from "./types";
import { project, colorFor } from "./utils/forecast";

type Props = {
  rows: Row[];
  months: Date[];
  onUpdateAvg: (part: string, value: number) => void;
  onUpdateOnOrder: (part: string, value: number) => void;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function ForecastTable({ rows, months, onUpdateAvg, onUpdateOnOrder }: Props) {
  const now = useMemo(() => new Date(), []);

  return (
    <>
      {/* ─── Mobile Cards ─── */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <MobileCard
            key={r.part}
            row={r}
            months={months}
            now={now}
            onUpdateAvg={onUpdateAvg}
            onUpdateOnOrder={onUpdateOnOrder}
          />
        ))}

        {rows.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No forecast data available.
          </div>
        )}
      </div>

      {/* ─── Desktop Table ─── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
              <th className="px-2 py-2.5 text-center w-8 font-medium">Status</th>
              <th className="px-2 py-2.5 text-left font-medium whitespace-nowrap">Part</th>
              <th className="px-2 py-2.5 text-left font-medium">Name</th>
              <th className="px-2 py-2.5 text-left font-medium">Fragrance</th>
              <th className="px-2 py-2.5 text-right font-medium">On Hand</th>
              <th className="px-2 py-2.5 text-right font-medium">On Order</th>
              <th className="px-2 py-2.5 text-right font-medium">Avg / Mo</th>
              {months.map((m) => (
                <th key={m.toISOString()} className="px-2 py-2.5 text-right whitespace-nowrap font-medium">
                  {m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ForecastRow
                key={r.part}
                row={r}
                months={months}
                onUpdateAvg={onUpdateAvg}
                onUpdateOnOrder={onUpdateOnOrder}
              />
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            No forecast data available.
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Mobile Card ─── */

function MobileCard({
  row: r,
  months,
  now,
  onUpdateAvg,
  onUpdateOnOrder,
}: {
  row: Row;
  months: Date[];
  now: Date;
  onUpdateAvg: (part: string, value: number) => void;
  onUpdateOnOrder: (part: string, value: number) => void;
}) {
  const [onOrderLocal, setOnOrderLocal] = useState(r.on_order === 0 ? "" : r.on_order.toString());
  const [avgLocal, setAvgLocal] = useState(r.avg_monthly_demand === 0 ? "" : r.avg_monthly_demand.toString());

  useEffect(() => {
    setOnOrderLocal(r.on_order === 0 ? "" : r.on_order.toString());
  }, [r.on_order]);

  useEffect(() => {
    setAvgLocal(r.avg_monthly_demand === 0 ? "" : r.avg_monthly_demand.toString());
  }, [r.avg_monthly_demand]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {/* Header */}
      <div>
        <div className="text-sm font-medium text-gray-900">{r.display_name}</div>
        <div className="font-mono text-xs text-gray-400">{r.part}</div>
        {r.fragrance && <div className="text-xs text-gray-500">{r.fragrance}</div>}
      </div>

      {/* Stats + editable */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">On Hand</div>
          <div className="text-sm tabular-nums font-medium text-gray-900">{fmt(r.on_hand)}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">On Order</div>
          <input
            inputMode="numeric"
            value={onOrderLocal}
            onChange={(e) => { setOnOrderLocal(e.target.value); if (e.target.value) onUpdateOnOrder(r.part, Number(e.target.value)); }}
            className="mt-0.5 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition"
          />
        </div>
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Avg / Mo</div>
          <input
            inputMode="numeric"
            value={avgLocal}
            onChange={(e) => { setAvgLocal(e.target.value); if (e.target.value) onUpdateAvg(r.part, Number(e.target.value)); }}
            className="mt-0.5 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition"
          />
        </div>
      </div>

      {/* Forecast months */}
      <div className="border-t border-gray-100 pt-3 space-y-1">
        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">12-Month Forecast</div>
        {months.map((m, i) => {
          const v = project(r, i, now);
          return (
            <div key={m.toISOString()} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">
                {m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
              </span>
              <span className={clsx("px-2 py-0.5 rounded-md text-xs tabular-nums font-medium", colorFor(v, r.avg_monthly_demand))}>
                {fmt(Math.round(v))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
