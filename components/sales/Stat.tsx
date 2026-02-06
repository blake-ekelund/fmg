type Props = {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "up" | "down" | "neutral";
};

export function Stat({
  label,
  value,
  delta,
  deltaType = "neutral",
}: Props) {
  const deltaColor =
    deltaType === "up"
      ? "text-green-600"
      : deltaType === "down"
      ? "text-red-600"
      : "text-gray-500";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">
        {label}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-2xl font-semibold tracking-tight tabular-nums text-gray-900">
          {value}
        </div>

        {delta && (
          <div className={`text-sm font-medium ${deltaColor}`}>
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}
