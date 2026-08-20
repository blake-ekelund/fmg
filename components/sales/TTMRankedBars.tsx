"use client";

import { CHART_NAVY } from "@/lib/colors";
import { fmtMoney } from "./constants";

export type RankedItem = {
  name: string;
  value: number;
};

/**
 * Ranked horizontal bars — replaces the old TTM treemap.
 *
 * The treemap was the wrong form twice over. It spent the color channel on
 * identity across 15 slices drawn from a single navy ramp, which put adjacent
 * pairs at ΔE ~4 (the readability floor is 15 for normal vision), so nobody
 * could tell the slices apart; and its cells only drew a label when they were
 * wider than 110px and taller than 40px, which in a 300px-tall box meant most
 * of the 15 products rendered as an unlabelled rectangle.
 *
 * Products are *nominal* categories — reordering them changes nothing — so
 * they take one hue and let bar length carry magnitude. One series needs no
 * legend; the title names it. Every row is direct-labelled, so the chart is
 * readable in grayscale, under any CVD, and in print.
 */
export function TTMRankedBars({ items }: { items: RankedItem[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  // Scale to the largest bar, not to the total — otherwise a long tail squashes
  // every bar into the left margin and the ranking stops being readable.
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);

  if (items.length === 0 || max <= 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-400">
        No revenue in this window
      </div>
    );
  }

  return (
    <div className="h-full">
      <ol className="space-y-2">
        {items.map((item, i) => {
          const pct = total > 0 ? item.value / total : 0;
          const width = Math.max((item.value / max) * 100, 0.5);

          return (
            <li key={item.name} className="group">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-gray-300">
                    {i + 1}
                  </span>
                  {/* Full name on hover — truncation is a display concession,
                      it shouldn't cost the reader the actual value. */}
                  <span
                    className="truncate text-[11px] text-gray-700"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-900">
                  ${fmtMoney(item.value)}
                  <span className="ml-1.5 font-normal text-gray-400">
                    {(pct * 100).toFixed(1)}%
                  </span>
                </span>
              </div>

              {/* Track + fill. 4px rounded data-end, anchored to the baseline. */}
              <div className="h-2 w-full overflow-hidden rounded-sm bg-gray-100">
                <div
                  className="h-full rounded-sm transition-[width] duration-300"
                  style={{ width: `${width}%`, backgroundColor: CHART_NAVY }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
