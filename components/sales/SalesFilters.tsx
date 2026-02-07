"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function SalesFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const now = new Date();

  const query = params.get("q") ?? "";
  const year =
    Number(params.get("year")) || now.getFullYear();
  const month =
    Number(params.get("month")) || now.getMonth() + 1;

  const update = useCallback(
    (next: { q?: string; year?: number; month?: number }) => {
      const p = new URLSearchParams(params.toString());

      if (next.q !== undefined) {
        next.q ? p.set("q", next.q) : p.delete("q");
      }
      if (next.year !== undefined) {
        p.set("year", String(next.year));
      }
      if (next.month !== undefined) {
        p.set("month", String(next.month));
      }

      router.replace(`/sales?${p.toString()}`);
    },
    [params, router]
  );

  return (
    <div
      className="
        flex
        items-center
        gap-3
        rounded-2xl
        border border-gray-200/70
        bg-white
        px-4 py-3
      "
    >
      {/* Search */}
      <input
        value={query}
        onChange={(e) =>
          update({ q: e.target.value })
        }
        placeholder="Search SKU, product, fragrance…"
        className="
          w-64
          rounded-xl
          border border-gray-200
          px-3 py-2
          text-sm
          focus:outline-none
          focus:ring-2
          focus:ring-gray-200
        "
      />

      {/* Year */}
      <select
        value={year}
        onChange={(e) =>
          update({ year: Number(e.target.value) })
        }
        className="
          rounded-xl
          border border-gray-200
          px-3 py-2
          text-sm
          focus:outline-none
          focus:ring-2
          focus:ring-gray-200
        "
      >
        {Array.from({ length: 6 }, (_, i) =>
          now.getFullYear() - i
        ).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      {/* Month */}
      <select
        value={month}
        onChange={(e) =>
          update({ month: Number(e.target.value) })
        }
        className="
          rounded-xl
          border border-gray-200
          px-3 py-2
          text-sm
          focus:outline-none
          focus:ring-2
          focus:ring-gray-200
        "
      >
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {new Date(2000, i, 1).toLocaleString(
              "en-US",
              { month: "long" }
            )}
          </option>
        ))}
      </select>
    </div>
  );
}
