// /components/sales/Stat.tsx
import { ArrowUp, ArrowDown } from "lucide-react";

type Props = {
  label: string;
  value: string;
  delta?: string | null;
  trend?: "up" | "down" | "flat";
  helper?: string;
};

export function Stat({
  label,
  value,
  delta,
  trend,
  helper,
}: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>

      <div className="mt-1 text-2xl font-semibold">
        {value}
      </div>

      {(delta || helper) && (
        <div className="mt-1 flex items-center gap-1 text-sm">
          {trend === "up" && (
            <ArrowUp className="h-4 w-4 text-green-600" />
          )}
          {trend === "down" && (
            <ArrowDown className="h-4 w-4 text-red-600" />
          )}

          {delta && (
            <span
              className={
                trend === "down"
                  ? "text-red-600"
                  : "text-green-600"
              }
            >
              {delta}
            </span>
          )}

          {helper && (
            <span className="text-gray-400">{helper}</span>
          )}
        </div>
      )}
    </div>
  );
}
