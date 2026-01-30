// /marketing/utils/formatDelta.ts
export function formatDelta(
  value: number | null,
  type: "percent" | "points" = "percent"
) {
  if (value === null) return null;

  const sign = value > 0 ? "+" : "";
  if (type === "points") {
    return `${sign}${(value * 100).toFixed(2)} pts`;
  }

  return `${sign}${(value * 100).toFixed(1)}%`;
}
