import { ForecastRow } from "../types";
import { daysInMonth, daysRemainingInMonth } from "./date";

export function project(
  row: ForecastRow,
  monthIndex: number,
  now: Date
): number {
  const firstMonthFraction =
    daysRemainingInMonth(now) / daysInMonth(now);

  let value =
    row.on_hand +
    row.on_order -
    row.avg_monthly_demand * firstMonthFraction;

  for (let i = 1; i <= monthIndex; i++) {
    value -= row.avg_monthly_demand;
  }

  return value;
}

export function colorFor(v: number, avg: number) {
  if (avg <= 0) return "bg-gray-50 text-gray-500";
  if (v < avg) return "bg-red-100 text-red-700";
  if (v < avg * 3) return "bg-yellow-100 text-yellow-800";
  return "bg-green-100 text-green-800";
}
