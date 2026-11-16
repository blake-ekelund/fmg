"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2, RotateCcw } from "lucide-react";
import { addMonths, describeDemand, type DemandProfile } from "@/lib/seasonalDemand";
import { brandBadgeStyle, type BrandSettings } from "@/lib/brand-settings";
import { getInventoryStatus, STATUS_RANK, type ForecastRow, type InventoryStatus } from "./types";

/**
 * Inventory → Demand view: expected units per SKU for each of the next 12
 * months, editable. A typed number becomes a hand-set override for that SKU and
 * month. It's saved, applied everywhere the forecast is used, and kept until
 * someone resets it (the cell's ↺, or "Reset" for every month at once).
 *
 * Styled to match the Monthly / Quarterly table (ForecastTable/ForecastRow):
 * same header type, status dot, part / name / brand cells and number weights.
 */

type DemandSort = "status" | "part" | "name" | "total";

const STATUS_DOT: Record<InventoryStatus, string> = {
  "at risk": "bg-red-500",
  "needs review": "bg-amber-400",
  healthy: "bg-green-500",
  "no demand": "bg-gray-300",
};

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function monthLabel(key: string, withYear: boolean): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
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

/** Busier / quieter than the SKU's own average, so the shape of the year reads at a glance. */
function shadeFor(v: number, avg: number): string {
  if (avg <= 0 || v <= 0) return "text-gray-300";
  if (v >= avg * 1.25) return "text-gray-900 font-semibold";
  if (v <= avg * 0.75) return "text-gray-400";
  return "text-gray-700";
}

export default function DemandTable({
  rows,
  startMonth,
  saving,
  showBrand,
  brandSettings,
  onSet,
  onReset,
  onRowClick,
}: {
  rows: ForecastRow[];
  /** yyyy-mm of the first column (this month). */
  startMonth: string;
  /** "part|i" keys currently saving ("part|*" = whole SKU). */
  saving: Set<string>;
  showBrand: boolean;
  brandSettings: Record<string, BrandSettings>;
  onSet: (part: string, monthIndex: number, units: number) => void;
  /** monthIndex undefined = every month for the SKU. */
  onReset: (part: string, monthIndex?: number) => void;
  onRowClick: (part: string) => void;
}) {
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => addMonths(startMonth, i)),
    [startMonth],
  );
  const tableRef = useRef<HTMLTableElement>(null);

  /* Own sort (null = the order the toolbar's filters handed us). */
  const [sort, setSort] = useState<{ key: DemandSort; dir: "asc" | "desc" } | null>(null);
  function toggleSort(key: DemandSort) {
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "total" ? "desc" : "asc" },
    );
  }

  const prepared = useMemo(() => {
    const list = rows.map((r) => {
      const p = r.demand ?? flat(r, startMonth);
      return {
        row: r,
        profile: p,
        status: getInventoryStatus(r.on_hand, r.on_order, r.avg_monthly_demand, r.demand),
        total: p.monthly.reduce((a, v) => a + Math.round(v), 0),
      };
    });
    if (!sort) return list;
    const m = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let c = 0;
      if (sort.key === "status") c = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      else if (sort.key === "part") c = a.row.part.localeCompare(b.row.part);
      else if (sort.key === "name") c = (a.row.display_name ?? "").localeCompare(b.row.display_name ?? "");
      else c = a.total - b.total;
      return c * m || a.row.part.localeCompare(b.row.part);
    });
  }, [rows, startMonth, sort]);

  const totals = useMemo(() => {
    const t = Array(12).fill(0) as number[];
    for (const { profile } of prepared) profile.monthly.forEach((v, i) => (t[i] += Math.round(v)));
    return t;
  }, [prepared]);

  /** Enter moves down a row in the same month, spreadsheet-style. */
  function focusBelow(rowIdx: number, monthIdx: number, step: 1 | -1) {
    const next = tableRef.current?.querySelector<HTMLInputElement>(
      `input[data-cell="${rowIdx + step}-${monthIdx}"]`,
    );
    next?.focus();
  }

  const th = "px-2 py-2.5 font-medium";

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table ref={tableRef} className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
            <SortTh label="" k="status" sort={sort} onSort={toggleSort} className="w-8 text-center" />
            <SortTh label="Part" k="part" sort={sort} onSort={toggleSort} className="text-left whitespace-nowrap" />
            <SortTh label="Name" k="name" sort={sort} onSort={toggleSort} className="text-left" />
            {showBrand && <th className={clsx(th, "text-left")}>Brand</th>}
            {months.map((m, i) => (
              <th
                key={m}
                className={clsx(
                  th,
                  "text-right whitespace-nowrap",
                  i === 0 && "bg-gray-50/80 text-gray-600",
                  i > 0 && m.endsWith("-01") && "border-l border-gray-200",
                )}
                title={i === 0 ? "This month" : undefined}
              >
                {monthLabel(m, i === 0 || m.endsWith("-01"))}
              </th>
            ))}
            <SortTh label="12-mo" k="total" sort={sort} onSort={toggleSort} className="border-l border-gray-200 text-right" />
            <th className="w-[1%] px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {prepared.map(({ row: r, profile: p, status, total }, rowIdx) => {
            const overriddenMonths = p.overridden?.filter(Boolean).length ?? 0;
            const brand = brandSettings[r.brand];
            return (
              <tr
                key={r.part}
                className={clsx(
                  "group border-b border-gray-100 transition",
                  status === "at risk" ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-gray-50",
                )}
              >
                <td className="px-2 py-1.5 text-center">
                  <span title={status} className={clsx("inline-block h-2 w-2 rounded-full", STATUS_DOT[status])} />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onRowClick(r.part)}
                    className="font-mono text-[11px] text-gray-500 hover:text-gray-900 hover:underline"
                    title="Open the product"
                  >
                    {r.part}
                  </button>
                </td>
                <td className="max-w-[16rem] px-2 py-1.5">
                  <span className="block truncate font-medium text-gray-900" title={r.display_name ?? undefined}>
                    {r.display_name || r.fragrance || "—"}
                  </span>
                </td>
                {showBrand && (
                  <td className="px-2 py-1.5">
                    <span
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      style={brandBadgeStyle(brand?.primary_color)}
                      title={brand?.display_name?.trim() || r.brand}
                    >
                      {r.brand}
                    </span>
                  </td>
                )}
                {months.map((m, i) => (
                  <DemandCell
                    key={m}
                    cellId={`${rowIdx}-${i}`}
                    value={p.monthly[i] ?? 0}
                    avg={p.avg}
                    base={p.base?.[i]}
                    overridden={!!p.overridden?.[i]}
                    saving={saving.has(`${r.part}|${i}`) || saving.has(`${r.part}|*`)}
                    monthName={monthLabel(m, true)}
                    current={i === 0}
                    yearStart={i > 0 && m.endsWith("-01")}
                    onCommit={(v) => onSet(r.part, i, v)}
                    onReset={() => onReset(r.part, i)}
                    onMove={(step) => focusBelow(rowIdx, i, step)}
                  />
                ))}
                <td
                  className="whitespace-nowrap border-l border-gray-100 px-2 py-1.5 text-right font-semibold tabular-nums text-gray-900"
                  title={describeDemand(p)}
                >
                  {total.toLocaleString("en-US")}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {overriddenMonths > 0 ? (
                    <button
                      type="button"
                      onClick={() => onReset(r.part)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
                      title={`${overriddenMonths} month${overriddenMonths === 1 ? "" : "s"} set by hand. Click to put them all back on the forecast.`}
                    >
                      <RotateCcw size={10} /> Reset {overriddenMonths}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
        {prepared.length > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200 text-xs font-semibold text-gray-900">
              <td />
              <td colSpan={showBrand ? 3 : 2} className="px-2 py-2.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Total · {prepared.length} SKU{prepared.length === 1 ? "" : "s"}
              </td>
              {totals.map((t, i) => (
                <td
                  key={i}
                  className={clsx(
                    "px-2 py-2.5 text-right tabular-nums",
                    i === 0 && "bg-gray-50/80",
                    i > 0 && months[i].endsWith("-01") && "border-l border-gray-200",
                  )}
                >
                  {fmt(t)}
                </td>
              ))}
              <td className="border-l border-gray-200 px-2 py-2.5 text-right tabular-nums">
                {fmt(totals.reduce((a, b) => a + b, 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string;
  k: DemandSort;
  sort: { key: DemandSort; dir: "asc" | "desc" } | null;
  onSort: (k: DemandSort) => void;
  className: string;
}) {
  const active = sort?.key === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={clsx(
        "group cursor-pointer select-none px-2 py-2.5 font-medium transition-colors hover:text-gray-600",
        className,
      )}
    >
      <span className={clsx("inline-flex items-center gap-0.5", className.includes("text-right") && "justify-end")}>
        {label}
        {active ? (
          sort!.dir === "asc" ? (
            <ChevronUp size={11} className="text-gray-600" />
          ) : (
            <ChevronDown size={11} className="text-gray-600" />
          )
        ) : (
          <ChevronsUpDown size={11} className="text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </span>
    </th>
  );
}

function DemandCell({
  cellId,
  value,
  avg,
  base,
  overridden,
  saving,
  monthName,
  current,
  yearStart,
  onCommit,
  onReset,
  onMove,
}: {
  cellId: string;
  value: number;
  avg: number;
  base?: number;
  overridden: boolean;
  saving: boolean;
  monthName: string;
  current: boolean;
  yearStart: boolean;
  onCommit: (units: number) => void;
  onReset: () => void;
  onMove: (step: 1 | -1) => void;
}) {
  const shown = Math.round(value);
  const [draft, setDraft] = useState(fmt(shown));
  const [editing, setEditing] = useState(false);
  const shownText = fmt(shown);
  const [lastShown, setLastShown] = useState(shownText);
  // Follow the saved value while not typing (adjusted during render, no effect).
  if (shownText !== lastShown) {
    setLastShown(shownText);
    if (!editing) setDraft(shownText);
  }

  const escaped = useRef(false);
  useEffect(() => {
    if (!editing) escaped.current = false;
  }, [editing]);

  function commit() {
    setEditing(false);
    if (escaped.current) {
      setDraft(shownText);
      return;
    }
    const digits = draft.replace(/[^\d]/g, "");
    const n = Number(digits);
    if (digits === "" || !Number.isFinite(n)) {
      setDraft(shownText);
      return;
    }
    setDraft(fmt(n));
    if (n !== shown) onCommit(n);
  }

  const forecast = base !== undefined ? Math.round(base) : shown;
  return (
    <td
      className={clsx(
        "px-0.5 py-1",
        current && "bg-gray-50/80",
        yearStart && "border-l border-gray-100",
      )}
    >
      <div
        className="group/cell relative"
        title={
          overridden
            ? `${monthName}: set by hand to ${fmt(shown)} (forecast ${fmt(forecast)}). Stays until reset.`
            : `${monthName}: forecast ${fmt(shown)}. Type a number to override it.`
        }
      >
        <input
          data-cell={cellId}
          inputMode="numeric"
          value={draft}
          onFocus={(e) => {
            setEditing(true);
            setDraft(String(shown));
            const el = e.currentTarget;
            requestAnimationFrame(() => el.select());
          }}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
              onMove(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              escaped.current = true;
              e.currentTarget.blur();
            }
          }}
          aria-label={`Demand for ${monthName}`}
          className={clsx(
            "h-7 w-full min-w-[3.5rem] rounded-md border px-1.5 text-right text-xs tabular-nums outline-none transition",
            "focus:border-gray-300 focus:bg-white focus:text-gray-900 focus:ring-2 focus:ring-gray-300",
            overridden
              ? "border-amber-200 bg-amber-50 font-semibold text-amber-800"
              : clsx("border-transparent bg-transparent hover:border-gray-200 hover:bg-white", shadeFor(value, avg)),
          )}
        />
        {saving ? (
          <Loader2 size={10} className="absolute -right-0.5 -top-1 animate-spin text-gray-400" />
        ) : overridden ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onReset}
            aria-label={`Reset ${monthName} to the forecast (${fmt(forecast)})`}
            title={`Reset to the forecast (${fmt(forecast)})`}
            className="absolute -right-1 -top-1.5 hidden h-4 w-4 place-items-center rounded-full border border-amber-300 bg-white text-amber-700 shadow-sm group-hover/cell:grid"
          >
            <RotateCcw size={9} />
          </button>
        ) : null}
      </div>
    </td>
  );
}
