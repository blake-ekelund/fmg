import { useState, useEffect } from "react";
import { ForecastRow as Row } from "./types";
import { project, colorFor } from "./utils/forecast";

type Props = {
  row: Row;
  months: Date[];
  onUpdateAvg: (part: string, value: number) => void;
  onUpdateOnOrder: (part: string, value: number) => void;
};

const inputClass = `
  w-20
  h-7
  rounded-md
  bg-blue-50
  text-blue-700
  placeholder-blue-300
  px-1.5
  text-xs
  text-right
  outline-none
  ring-1
  ring-blue-100
  focus:ring-2
  focus:ring-blue-400
  focus:bg-white
  transition
`;

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(n);
}

function parseFormatted(value: string): number {
  const numeric = value.replace(/[^\d]/g, "");
  return numeric ? Number(numeric) : 0;
}

/** Inventory health calculation */
function getInventoryStatus(
  onHand: number,
  onOrder: number,
  avg: number
) {
  if (avg <= 0) {
    return {
      label: "No demand",
      className: "bg-gray-300",
    };
  }

  const monthsOfSupply = (onHand + onOrder) / avg;

  if (monthsOfSupply > 3) {
    return {
      label: "Healthy",
      className: "bg-green-500",
    };
  }

  if (monthsOfSupply > 1.5) {
    return {
      label: "Needs review",
      className: "bg-yellow-400",
    };
  }

  return {
    label: "At risk",
    className: "bg-red-500",
  };
}

export default function ForecastRow({
  row,
  months,
  onUpdateAvg,
  onUpdateOnOrder,
}: Props) {
  const [onOrderText, setOnOrderText] = useState(
    formatNumber(row.on_order)
  );
  const [avgText, setAvgText] = useState(
    formatNumber(row.avg_monthly_demand)
  );

  useEffect(() => {
    setOnOrderText(formatNumber(row.on_order));
  }, [row.on_order]);

  useEffect(() => {
    setAvgText(formatNumber(row.avg_monthly_demand));
  }, [row.avg_monthly_demand]);

  const status = getInventoryStatus(
    row.on_hand,
    row.on_order,
    row.avg_monthly_demand
  );

  return (
    <tr className="border-b border-gray-100">
      {/* Status Indicator */}
      <td className="px-2 py-1.5 text-center">
        <span
          title={status.label}
          className={`
            inline-block
            h-2.5
            w-2.5
            rounded-full
            ${status.className}
          `}
        />
      </td>

      <td className="px-2 py-1.5 font-mono text-[11px] text-gray-600">
        {row.part}
      </td>

      <td className="px-2 py-1.5">
        {row.display_name}
      </td>

      <td className="px-2 py-1.5 text-xs text-gray-600">
        {row.fragrance ?? "—"}
      </td>

      <td className="px-2 py-1.5 text-right tabular-nums">
        {formatNumber(row.on_hand)}
      </td>

      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          inputMode="numeric"
          value={onOrderText}
          onChange={(e) => {
            setOnOrderText(e.target.value);
            onUpdateOnOrder(
              row.part,
              parseFormatted(e.target.value)
            );
          }}
          onBlur={() => {
            const parsed = parseFormatted(onOrderText);
            setOnOrderText(formatNumber(parsed));
            onUpdateOnOrder(row.part, parsed);
          }}
          className={inputClass}
        />
      </td>

      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          inputMode="numeric"
          value={avgText}
          onChange={(e) => {
            setAvgText(e.target.value);
            onUpdateAvg(
              row.part,
              parseFormatted(e.target.value)
            );
          }}
          onBlur={() => {
            const parsed = parseFormatted(avgText);
            setAvgText(formatNumber(parsed));
            onUpdateAvg(row.part, parsed);
          }}
          className={inputClass}
        />
      </td>

      {months.map((_, i) => {
        const v = project(row, i);
        return (
          <td
            key={i}
            className={`
              px-2
              py-1.5
              text-right
              tabular-nums
              text-xs
              ${colorFor(v, row.avg_monthly_demand)}
            `}
          >
            {formatNumber(Math.round(v))}
          </td>
        );
      })}
    </tr>
  );
}
