import { useState, useEffect, useMemo } from "react";
import clsx from "clsx";
import { ForecastRow as Row, getInventoryStatus, Period } from "./types";
import { project, colorFor } from "./utils/forecast";
import { brandBadgeStyle, BrandSettings } from "@/lib/brand-settings";

type Props = {
  row: Row;
  periods: Period[];
  showBrand: boolean;
  brandSettings?: BrandSettings;
  onRowClick: (part: string) => void;
  onUpdateAvg: (part: string, value: number) => void;
  onUpdateOnOrder: (part: string, value: number) => void;
};

const inputClass =
  "w-20 h-7 rounded-md border border-gray-200 bg-gray-50 px-1.5 text-xs text-right text-gray-700 placeholder:text-gray-300 outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition tabular-nums";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function parseFormatted(value: string): number {
  const numeric = value.replace(/[^\d]/g, "");
  return numeric ? Number(numeric) : 0;
}

function statusVisuals(label: ReturnType<typeof getInventoryStatus>) {
  switch (label) {
    case "at risk":
      return {
        dot: "bg-red-500",
        rowBg: "bg-red-50",
        rowHover: "hover:bg-red-100/60",
      };
    case "needs review":
      return {
        dot: "bg-amber-400",
        rowBg: "",
        rowHover: "hover:bg-gray-50",
      };
    case "healthy":
      return {
        dot: "bg-green-500",
        rowBg: "",
        rowHover: "hover:bg-gray-50",
      };
    case "no demand":
      return {
        dot: "bg-gray-300",
        rowBg: "",
        rowHover: "hover:bg-gray-50",
      };
  }
}

export default function ForecastRow({
  row,
  periods,
  showBrand,
  brandSettings,
  onRowClick,
  onUpdateAvg,
  onUpdateOnOrder,
}: Props) {
  const [onOrderText, setOnOrderText] = useState(formatNumber(row.on_order));
  const [avgText, setAvgText] = useState(formatNumber(row.avg_monthly_demand));

  useEffect(() => {
    setOnOrderText(formatNumber(row.on_order));
  }, [row.on_order]);

  useEffect(() => {
    setAvgText(formatNumber(row.avg_monthly_demand));
  }, [row.avg_monthly_demand]);

  const statusLabel = getInventoryStatus(
    row.on_hand,
    row.on_order,
    row.avg_monthly_demand,
  );
  const visuals = statusVisuals(statusLabel);
  const now = useMemo(() => new Date(), []);
  const brandStyle = brandBadgeStyle(brandSettings?.primary_color);
  const brandTitle = brandSettings?.display_name?.trim() || row.brand;

  // Stop row-click navigation when the user clicks an editable cell.
  const stopRow = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <tr
      onClick={() => onRowClick(row.part)}
      className={clsx(
        "border-b border-gray-100 transition cursor-pointer",
        visuals.rowBg,
        visuals.rowHover,
      )}
    >
      {/* Status dot */}
      <td className="px-2 py-2 text-center">
        <span
          title={statusLabel}
          className={clsx("inline-block h-2 w-2 rounded-full", visuals.dot)}
        />
      </td>

      {/* Part */}
      <td className="px-2 py-2 font-mono text-[11px] text-gray-500 whitespace-nowrap">
        {row.part}
      </td>

      {/* Name */}
      <td className="px-2 py-2 text-xs text-gray-900 font-medium">
        {row.display_name}
      </td>

      {/* Brand (optional) */}
      {showBrand && (
        <td className="px-2 py-2">
          <span
            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={brandStyle}
            title={brandTitle}
          >
            {row.brand}
          </span>
        </td>
      )}

      {/* Fragrance */}
      <td className="px-2 py-2 text-xs text-gray-500">
        {row.fragrance ?? "—"}
      </td>

      {/* On Hand */}
      <td className="px-2 py-2 text-right tabular-nums text-xs text-gray-700">
        {formatNumber(row.on_hand)}
      </td>

      {/* On Order (editable) */}
      <td className="px-2 py-2 text-right" onClick={stopRow}>
        <input
          type="text"
          inputMode="numeric"
          value={onOrderText}
          onChange={(e) => {
            setOnOrderText(e.target.value);
            onUpdateOnOrder(row.part, parseFormatted(e.target.value));
          }}
          onBlur={() => {
            const parsed = parseFormatted(onOrderText);
            setOnOrderText(formatNumber(parsed));
            onUpdateOnOrder(row.part, parsed);
          }}
          className={inputClass}
        />
      </td>

      {/* Avg / Mo (editable) */}
      <td className="px-2 py-2 text-right" onClick={stopRow}>
        <input
          type="text"
          inputMode="numeric"
          value={avgText}
          onChange={(e) => {
            setAvgText(e.target.value);
            onUpdateAvg(row.part, parseFormatted(e.target.value));
          }}
          onBlur={() => {
            const parsed = parseFormatted(avgText);
            setAvgText(formatNumber(parsed));
            onUpdateAvg(row.part, parsed);
          }}
          className={inputClass}
        />
      </td>

      {/* Projection columns (monthly or quarterly, driven by periods prop) */}
      {periods.map((p, i) => {
        const v = project(row, p.index, now);
        return (
          <td
            key={i}
            className={clsx(
              "px-2 py-2 text-right tabular-nums text-xs",
              colorFor(v, row.avg_monthly_demand),
            )}
          >
            {formatNumber(Math.round(v))}
          </td>
        );
      })}
    </tr>
  );
}
