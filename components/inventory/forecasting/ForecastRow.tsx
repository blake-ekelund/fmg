import { useState, useEffect, useMemo } from "react";
import clsx from "clsx";
import { ForecastRow as Row } from "./types";
import { project, colorFor } from "./utils/forecast";

type Props = {
  row: Row;
  months: Date[];
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

function getInventoryStatus(onHand: number, onOrder: number, avg: number) {
  if (avg <= 0) return { label: "No demand", dot: "bg-gray-300", bg: "" };
  const mos = (onHand + onOrder) / avg;
  if (mos > 3) return { label: "Healthy", dot: "bg-green-500", bg: "" };
  if (mos > 1.5) return { label: "Needs review", dot: "bg-amber-400", bg: "" };
  return { label: "At risk", dot: "bg-red-500", bg: "bg-red-50/40" };
}

export default function ForecastRow({ row, months, onUpdateAvg, onUpdateOnOrder }: Props) {
  const [onOrderText, setOnOrderText] = useState(formatNumber(row.on_order));
  const [avgText, setAvgText] = useState(formatNumber(row.avg_monthly_demand));

  useEffect(() => {
    setOnOrderText(formatNumber(row.on_order));
  }, [row.on_order]);

  useEffect(() => {
    setAvgText(formatNumber(row.avg_monthly_demand));
  }, [row.avg_monthly_demand]);

  const status = getInventoryStatus(row.on_hand, row.on_order, row.avg_monthly_demand);
  const now = useMemo(() => new Date(), []);

  return (
    <tr className={clsx("border-b border-gray-100 hover:bg-gray-50 transition", status.bg)}>
      {/* Status */}
      <td className="px-2 py-2 text-center">
        <span
          title={status.label}
          className={clsx("inline-block h-2 w-2 rounded-full", status.dot)}
        />
      </td>

      {/* Part */}
      <td className="px-2 py-2 font-mono text-[11px] text-gray-500 whitespace-nowrap">{row.part}</td>

      {/* Name */}
      <td className="px-2 py-2 text-xs text-gray-900 font-medium">{row.display_name}</td>

      {/* Fragrance */}
      <td className="px-2 py-2 text-xs text-gray-500">{row.fragrance ?? "—"}</td>

      {/* On Hand */}
      <td className="px-2 py-2 text-right tabular-nums text-xs text-gray-700">
        {formatNumber(row.on_hand)}
      </td>

      {/* On Order (editable) */}
      <td className="px-2 py-2 text-right">
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
      <td className="px-2 py-2 text-right">
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
          title="Default = units sold in last 90 days ÷ 3"
        />
      </td>

      {/* Projections */}
      {months.map((_, i) => {
        const v = project(row, i, now);
        return (
          <td
            key={i}
            className={clsx("px-2 py-2 text-right tabular-nums text-xs", colorFor(v, row.avg_monthly_demand))}
          >
            {formatNumber(Math.round(v))}
          </td>
        );
      })}
    </tr>
  );
}
