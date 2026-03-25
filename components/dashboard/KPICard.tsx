"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import clsx from "clsx";

type Props = {
  label: string;
  value: string;
  subtitle?: string;
  variance?: number;
  variantLabel?: string;
  color?: "emerald" | "amber" | "rose" | "sky" | "violet";
};

const COLOR_MAP = {
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-500" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500" },
  rose: { bg: "bg-rose-50", border: "border-rose-200", icon: "text-rose-500" },
  sky: { bg: "bg-sky-50", border: "border-sky-200", icon: "text-sky-500" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", icon: "text-violet-500" },
};

export default function KPICard({ label, value, subtitle, variance, variantLabel, color }: Props) {
  const isFavorable = variance != null && variance >= 0;
  const isUnfavorable = variance != null && variance < 0;
  const colorCfg = color ? COLOR_MAP[color] : null;

  return (
    <div className={clsx(
      "rounded-2xl border p-4 transition-shadow hover:shadow-sm",
      colorCfg ? `${colorCfg.bg} ${colorCfg.border}` : "bg-white border-gray-200"
    )}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums text-gray-900">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>
      )}
      {variance != null && (
        <div className={clsx(
          "flex items-center gap-1 mt-2 text-xs font-semibold",
          isFavorable ? "text-emerald-600" : "text-rose-600"
        )}>
          {isFavorable ? (
            variance === 0 ? <Minus size={12} /> : <TrendingUp size={12} />
          ) : (
            <TrendingDown size={12} />
          )}
          <span>
            {isUnfavorable ? "(" : ""}
            ${Math.abs(variance).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            {isUnfavorable ? ")" : ""}
          </span>
          {variantLabel && (
            <span className="text-gray-400 font-normal ml-0.5">{variantLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
