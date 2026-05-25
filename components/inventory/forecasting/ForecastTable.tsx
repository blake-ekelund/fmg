import { useMemo, useState, useEffect } from "react";
import clsx from "clsx";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import ForecastRow from "./ForecastRow";
import {
  ForecastRow as Row,
  Period,
  SortKey,
  SortDir,
  getInventoryStatus,
} from "./types";
import { project, colorFor } from "./utils/forecast";
import { brandBadgeStyle, BrandSettings } from "@/lib/brand-settings";

type Props = {
  rows: Row[];
  periods: Period[];
  showBrand: boolean;
  brandSettings: Record<string, BrandSettings>;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onRowClick: (part: string) => void;
  onUpdateAvg: (part: string, value: number) => void;
  onUpdateOnOrder: (part: string, value: number) => void;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function ForecastTable({
  rows,
  periods,
  showBrand,
  brandSettings,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  onUpdateAvg,
  onUpdateOnOrder,
}: Props) {
  const now = useMemo(() => new Date(), []);

  return (
    <>
      {/* ─── Mobile Cards ─── */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <MobileCard
            key={r.part}
            row={r}
            periods={periods}
            brandSettings={brandSettings[r.brand]}
            showBrand={showBrand}
            now={now}
            onRowClick={onRowClick}
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
              <SortableTh
                label=""
                sortKey="status"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                widthClass="w-8 text-center"
              />
              <SortableTh
                label="Part"
                sortKey="part"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                widthClass="text-left whitespace-nowrap"
              />
              <SortableTh
                label="Name"
                sortKey="display_name"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                widthClass="text-left"
              />
              {showBrand && (
                <th className="px-2 py-2.5 text-left font-medium">Brand</th>
              )}
              <SortableTh
                label="Fragrance"
                sortKey="fragrance"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                widthClass="text-left"
              />
              <SortableTh
                label="On Hand"
                sortKey="on_hand"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                widthClass="text-right"
              />
              <SortableTh
                label="On Order"
                sortKey="on_order"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                widthClass="text-right"
              />
              <SortableTh
                label="Avg / Mo"
                sortKey="avg_monthly_demand"
                activeKey={sortKey}
                dir={sortDir}
                onSort={onSort}
                widthClass="text-right"
              />
              {periods.map((p) => (
                <th
                  key={p.label}
                  className="px-2 py-2.5 text-right whitespace-nowrap font-medium"
                >
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ForecastRow
                key={r.part}
                row={r}
                periods={periods}
                showBrand={showBrand}
                brandSettings={brandSettings[r.brand]}
                onRowClick={onRowClick}
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

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  widthClass,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  widthClass: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={clsx(
        "px-2 py-2.5 font-medium select-none cursor-pointer hover:text-gray-600 transition-colors group",
        widthClass,
      )}
    >
      <span
        className={clsx(
          "inline-flex items-center gap-0.5",
          widthClass.includes("text-right") && "justify-end",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp size={11} className="text-gray-600" />
          ) : (
            <ChevronDown size={11} className="text-gray-600" />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}
      </span>
    </th>
  );
}

/* ─── Mobile Card ─── */

function MobileCard({
  row: r,
  periods,
  showBrand,
  brandSettings,
  now,
  onRowClick,
  onUpdateAvg,
  onUpdateOnOrder,
}: {
  row: Row;
  periods: Period[];
  showBrand: boolean;
  brandSettings?: BrandSettings;
  now: Date;
  onRowClick: (part: string) => void;
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

  const statusLabel = getInventoryStatus(r.on_hand, r.on_order, r.avg_monthly_demand);
  const atRisk = statusLabel === "at risk";
  const brandStyle = brandBadgeStyle(brandSettings?.primary_color);
  const stopRow = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={() => onRowClick(r.part)}
      className={clsx(
        "rounded-xl border bg-white p-4 space-y-3 cursor-pointer transition",
        atRisk ? "border-red-200 bg-red-50/40" : "border-gray-200",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{r.display_name}</div>
          <div className="font-mono text-xs text-gray-400">{r.part}</div>
          {r.fragrance && <div className="text-xs text-gray-500">{r.fragrance}</div>}
        </div>
        {showBrand && (
          <span
            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium shrink-0"
            style={brandStyle}
          >
            {r.brand}
          </span>
        )}
      </div>

      {/* Stats + editable */}
      <div className="grid grid-cols-3 gap-3" onClick={stopRow}>
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
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            Avg / Mo
          </div>
          <input
            inputMode="numeric"
            value={avgLocal}
            onChange={(e) => { setAvgLocal(e.target.value); if (e.target.value) onUpdateAvg(r.part, Number(e.target.value)); }}
            className="mt-0.5 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition"
          />
        </div>
      </div>

      {/* Forecast periods */}
      <div className="border-t border-gray-100 pt-3 space-y-1">
        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
          Forecast
        </div>
        {periods.map((p) => {
          const v = project(r, p.index, now);
          return (
            <div key={p.label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{p.label}</span>
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
