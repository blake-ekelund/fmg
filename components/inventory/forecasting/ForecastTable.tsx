import { useMemo, useState, useEffect } from "react";
import ForecastRow from "./ForecastRow";
import { ForecastRow as Row } from "./types";
import { project, colorFor } from "./utils/forecast";

type Props = {
  rows: Row[];
  months: Date[];
  onUpdateAvg: (part: string, value: number) => void;
  onUpdateOnOrder: (part: string, value: number) => void;
};

export default function ForecastTable({
  rows,
  months,
  onUpdateAvg,
  onUpdateOnOrder,
}: Props) {
  const now = useMemo(() => new Date(), []);

  return (
    <>
      {/* ========================= */}
      {/* Mobile: Card View */}
      {/* ========================= */}
      <div className="space-y-4 md:hidden">
        {rows.map((r) => (
          <div
            key={r.part}
            className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-gray-900">
                  {r.display_name}
                </div>
                <div className="font-mono text-xs text-gray-500">
                  {r.part}
                </div>
                {r.fragrance && (
                  <div className="text-xs text-gray-500">
                    {r.fragrance}
                  </div>
                )}
              </div>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-3 gap-3 text-sm tabular-nums">
              <Stat label="On Hand" value={r.on_hand} />

              <EditableStat
                label="On Order"
                value={r.on_order}
                onChange={(v) => onUpdateOnOrder(r.part, v)}
              />

              <EditableStat
                label="Avg / Mo"
                value={r.avg_monthly_demand}
                onChange={(v) => onUpdateAvg(r.part, v)}
              />
            </div>

            {/* Forecast */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <div className="text-xs font-medium text-gray-500">
                Forecast
              </div>

              <div className="space-y-1 text-sm tabular-nums">
                {months.map((m, i) => {
                  const v = project(r, i, now);

                  return (
                    <div
                      key={m.toISOString()}
                      className="flex items-center justify-between"
                    >
                      <span className="text-gray-500">
                        {m.toLocaleDateString("en-US", {
                          month: "short",
                          year: "2-digit",
                        })}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-md text-xs ${colorFor(
                          v,
                          r.avg_monthly_demand
                        )}`}
                      >
                        {Math.round(v).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="p-4 text-sm text-gray-500">
            No forecast data available.
          </div>
        )}
      </div>

      {/* ========================= */}
      {/* Desktop: Table View */}
      {/* ========================= */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="px-2 py-1.5 text-center w-8">Status</th>
              <th className="px-2 py-1.5 text-left">Part</th>
              <th className="px-2 py-1.5 text-left">Name</th>
              <th className="px-2 py-1.5 text-left">Fragrance</th>
              <th className="px-2 py-1.5 text-right">On Hand</th>
              <th className="px-2 py-1.5 text-right">On Order</th>
              <th className="px-2 py-1.5 text-right">Avg / Mo</th>

              {months.map((m) => (
                <th
                  key={m.toISOString()}
                  className="px-2 py-1.5 text-right whitespace-nowrap"
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
          <div className="p-6 text-sm text-gray-500">
            No forecast data available.
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------
   Mobile helpers
--------------------------------------------- */

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-900">{value.toLocaleString()}</div>
    </div>
  );
}

function EditableStat({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(
    value === 0 ? "" : value.toString()
  );

  useEffect(() => {
    setLocal(value === 0 ? "" : value.toString());
  }, [value]);

  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>

      <input
        inputMode="numeric"
        value={local}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);

          if (v === "") return;
          onChange(Number(v));
        }}
        className="
          mt-0.5 w-full rounded-md
          border border-gray-200
          px-2 py-1 text-sm
        "
      />
    </div>
  );
}
