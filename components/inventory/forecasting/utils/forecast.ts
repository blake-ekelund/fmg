import { ForecastRow } from "../types";
import { daysInMonth, daysRemainingInMonth } from "./date";

export function project(row: ForecastRow, monthIndex: number): number {
  const now = new Date();

  if (monthIndex === 0) {
    const fraction =
      daysRemainingInMonth(now) / daysInMonth(now);

    return (
      row.on_hand -
      row.avg_monthly_demand * fraction +
      row.on_order
    );
  }

  return (
    project(row, monthIndex - 1) -
    row.avg_monthly_demand
  );
}

export function colorFor(v: number, avg: number) {
  if (avg <= 0) return "bg-gray-50 text-gray-500";
  if (v < avg) return "bg-red-100 text-red-700";
  if (v < avg * 3) return "bg-yellow-100 text-yellow-800";
  return "bg-green-100 text-green-800";
}
