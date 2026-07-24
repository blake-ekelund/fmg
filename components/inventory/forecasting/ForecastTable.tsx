import { useMemo, useState, useEffect } from "react";
import clsx from "clsx";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import ForecastRow from "./ForecastRow";
import {
  ForecastRow as Row,
  Period,
  SortKey,
  SortDir,
  InventoryStatus,
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

/** Cards drawn per "show more" tap on mobile. */
const MOBILE_PAGE = 25;

/** Mirrors the toolbar's status pill colours so the two read as one system. */
const STATUS_CHIP: Record<InventoryStatus, string> = {
  "at risk": "bg-red-50 text-red-700 border-red-200",
  "needs review": "bg-amber-50 text-amber-700 border-amber-200",
  healthy: "bg-green-50 text-green-700 border-green-200",
  "no demand": "bg-gray-100 text-gray-500 border-gray-200",
};

/** Forecast periods a card shows before you ask for the rest. */
const CARD_PERIOD_PREVIEW = 3;

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

  /* Mobile renders cards, not rows — each one is ~20× the height of a table
     row, so drawing the whole catalogue means tens of thousands of pixels of
     scroll. Batch it. Desktop keeps every row: a table row is cheap. */
  const [mobileLimit, setMobileLimit] = useState(MOBILE_PAGE);

  /* A new filter/sort result is a new list, so collapse back to the first page.
     Adjusted during render rather than in an effect — an effect would paint the
     old limit against the new rows first, then immediately re-render. */
  const [lastRows, setLastRows] = useState(rows);
  if (rows !== lastRows) {
    setLastRows(rows);
    setMobileLimit(MOBILE_PAGE);
  }

  const mobileRows = rows.slice(0, mobileLimit);
  const mobileRemaining = rows.length - mobileRows.length;

  return (
    <>
      {/* ─── Mobile Cards ─── */}
      <div className="space-y-3 md:hidden">
        {mobileRows.map((r) => (
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

        {mobileRemaining > 0 && (
          <button
            onClick={() => setMobileLimit((n) => n + MOBILE_PAGE)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Show {Math.min(MOBILE_PAGE, mobileRemaining)} more
            <span className="ml-1 text-gray-400">
              ({mobileRemaining} left)
            </span>
          </button>
        )}

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

  const [showAllPeriods, setShowAllPeriods] = useState(false);

  const statusLabel = getInventoryStatus(r.on_hand, r.on_order, r.avg_monthly_demand);
  const atRisk = statusLabel === "at risk";
  const brandStyle = brandBadgeStyle(brandSettings?.primary_color);
  const stopRow = (e: React.MouseEvent) => e.stopPropagation();
  const visiblePeriods = showAllPeriods
    ? periods
    : periods.slice(0, CARD_PERIOD_PREVIEW);

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
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* The desktop table has a status column; the card had only a faint
              border tint, which left the most important field invisible. */}
          <span
            className={clsx(
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize",
              STATUS_CHIP[statusLabel],
            )}
          >
            {statusLabel}
          </span>
          {showBrand && (
            <span
              className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              style={brandStyle}
            >
              {r.brand}
            </span>
          )}
        </div>
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

      {/* Forecast periods — the near months are what you act on, and showing
          all twelve made the forecast list four fifths of the card. */}
      <div className="border-t border-gray-100 pt-3 space-y-1" onClick={stopRow}>
        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
          Forecast
        </div>
        {visiblePeriods.map((p) => {
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

        {periods.length > CARD_PERIOD_PREVIEW && (
          <button
            onClick={() => setShowAllPeriods((v) => !v)}
            aria-expanded={showAllPeriods}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition hover:text-gray-800"
          >
            <ChevronDown
              size={13}
              className={clsx(
                "transition-transform duration-150",
                showAllPeriods && "rotate-180",
              )}
            />
            {showAllPeriods
              ? "Show less"
              : `Show all ${periods.length} periods`}
          </button>
        )}
      </div>
    </div>
  );
}
