"use client";

import { BrandView } from "./types";

export default function BrandToggle({
  brand,
  onChange,
}: {
  brand: BrandView;
  onChange: (b: BrandView) => void;
}) {
  return (
    <div
      className="
        inline-flex
        md:rounded-xl
        rounded-lg
        border border-gray-200
        p-1
        bg-white
        overflow-x-auto
        scrollbar-none
        gap-1
      "
    >
      {(["all", "NI", "Sassy"] as BrandView[]).map((b) => (
        <button
          key={b}
          onClick={() => onChange(b)}
          className={`
            flex-shrink-0
            px-4 py-2 md:px-3 md:py-1.5
            text-sm
            rounded-lg
            transition
            ${
              brand === b
                ? "bg-gray-100 text-black"
                : "text-gray-500 hover:text-black"
            }
          `}
        >
          {/* Desktop label */}
          <span className="hidden md:inline">
            {b === "all" ? "All Brands" : b}
          </span>

          {/* Mobile label */}
          <span className="md:hidden">
            {b === "all" ? "All" : b}
          </span>
        </button>
      ))}
    </div>
  );
}
