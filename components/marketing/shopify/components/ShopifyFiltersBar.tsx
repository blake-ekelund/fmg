// /shopify/components/ShopifyFiltersBar.tsx
"use client";

import { ShopifyDateRange } from "../types";

type Props = {
  range: ShopifyDateRange;
  onChange: (range: ShopifyDateRange) => void;
};

const OPTIONS: { label: string; value: ShopifyDateRange }[] = [
  { label: "Current Month", value: "current_month" },
  { label: "Last Month", value: "last_month" },
  { label: "This Year", value: "this_year" },
  { label: "Last Year", value: "last_year" },
];

export function ShopifyFiltersBar({ range, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-gray-50 p-1.5 shadow-sm">
      {OPTIONS.map((opt) => {
        const active = range === opt.value;

        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              "px-4 py-1.5 text-sm rounded-xl transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-800/40",
              active
                ? "bg-orange-800 text-white shadow"
                : "text-gray-600 hover:bg-white hover:text-gray-900",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
