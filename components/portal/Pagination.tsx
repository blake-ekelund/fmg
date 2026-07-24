"use client";

import { ChevronLeft, ChevronRight } from "@/components/portal/icons";

/**
 * Page-size + prev/next control for the Customers and Orders tables. Purely
 * presentational — it pages over rows the client already has; the parent owns
 * `page` / `pageSize` state and slices its own list.
 */

export const PAGE_SIZES = [25, 50, 100] as const;

export default function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number; // 0-indexed
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  /* Turning the page jumps back to the top so the rep starts reading at row 1,
     not wherever they scrolled to. Honours reduced-motion. */
  function go(p: number) {
    onPage(p);
    if (typeof window !== "undefined") {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-gray-500">
        {total === 0
          ? "No results"
          : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </p>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          Rows
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="appearance-none rounded-md border border-gray-200 bg-white py-1 pl-2 pr-6 text-xs font-medium text-gray-700 hover:border-gray-300 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronRight
              size={12}
              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rotate-90 text-gray-400"
            />
          </div>
        </label>

        <div className="flex items-center gap-1">
          <button
            onClick={() => go(page - 1)}
            disabled={page <= 0}
            aria-label="Previous page"
            className="rounded-md border border-gray-200 p-1 text-gray-500 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-gray-500">
            {page + 1} / {pages}
          </span>
          <button
            onClick={() => go(page + 1)}
            disabled={page >= pages - 1}
            aria-label="Next page"
            className="rounded-md border border-gray-200 p-1 text-gray-500 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
