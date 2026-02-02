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
    <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-white">
      {(["all", "NI", "Sassy"] as BrandView[]).map((b) => (
        <button
          key={b}
          onClick={() => onChange(b)}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            brand === b
              ? "bg-gray-100 text-black"
              : "text-gray-500 hover:text-black"
          }`}
        >
          {b === "all" ? "All Brands" : b}
        </button>
      ))}
    </div>
  );
}
