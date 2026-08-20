"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { CustomerStats } from "./hooks/queryHelpers";
import { formatCompactCount } from "./customerDisplay";

type Tone = "green" | "amber" | "gray";

const STATUS_OPTIONS: { label: string; value: string; tone: Tone }[] = [
  { label: "Active", value: "active", tone: "green" },
  { label: "At Risk", value: "at_risk", tone: "amber" },
  { label: "Churned", value: "churned", tone: "gray" },
];

const DOT_CLASS: Record<Tone, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  gray: "bg-gray-400",
};

/**
 * Status filter for the customer lists. Replaces the old segmented pill row:
 * the buckets aren't mutually exclusive questions ("show me at-risk *and*
 * churned" is a real ask), so this is a multi-select. No selection means
 * "All" — the query then applies no status restriction at all.
 *
 * Counts come from the same head-only bucket queries that fed the pills, and
 * still ignore the status dimension, so the numbers stay stable as the user
 * checks and unchecks boxes.
 */
export default function StatusFilter({
  statuses,
  setStatuses,
  stats,
}: {
  statuses: string[];
  setStatuses: (v: string[]) => void;
  stats: CustomerStats;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const countFor: Record<string, number> = {
    active: stats.active,
    at_risk: stats.atRisk,
    churned: stats.churned,
  };

  // Selected rows are summed for the button label. The buckets are disjoint
  // (a customer's last order falls in exactly one date range), so the sum is
  // the real size of the union rather than an over-count.
  const selectedTotal = statuses.reduce((n, s) => n + (countFor[s] ?? 0), 0);

  const label =
    statuses.length === 0
      ? `All (${formatCompactCount(stats.all)})`
      : statuses.length === 1
        ? `${STATUS_OPTIONS.find((o) => o.value === statuses[0])?.label ?? statuses[0]} (${formatCompactCount(selectedTotal)})`
        : `${statuses.length} statuses (${formatCompactCount(selectedTotal)})`;

  const exactTitle =
    statuses.length === 0
      ? `${stats.all.toLocaleString()} customers`
      : `${selectedTotal.toLocaleString()} customers`;

  function toggle(value: string) {
    const next = new Set(statuses);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setStatuses(Array.from(next));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={exactTitle}
        className={clsx(
          "inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition md:min-h-0 md:px-2.5 md:py-1.5",
          statuses.length > 0
            ? "border-gray-900 bg-gray-900 text-white"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
        )}
      >
        {label}
        <ChevronDown
          size={13}
          className={statuses.length > 0 ? "text-white/70" : "text-gray-400"}
        />
      </button>

      {/* Right-aligned: this control lives at the right edge of the toolbar, so
          a left-anchored panel would hang off the viewport on narrow screens. */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => setStatuses([])}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 md:py-1.5"
          >
            <span className="flex items-center gap-2">
              <span
                className={clsx(
                  "flex h-3.5 w-3.5 items-center justify-center rounded border",
                  statuses.length === 0
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300",
                )}
              >
                {statuses.length === 0 && <Check size={10} strokeWidth={3} />}
              </span>
              <span className="text-xs font-medium text-gray-700">All</span>
            </span>
            <span
              className="text-[11px] tabular-nums text-gray-400"
              title={`${stats.all.toLocaleString()} customers`}
            >
              {formatCompactCount(stats.all)}
            </span>
          </button>

          <div className="my-1 border-t border-gray-100" />

          {STATUS_OPTIONS.map((o) => {
            const checked = statuses.includes(o.value);
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 md:py-1.5"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "flex h-3.5 w-3.5 items-center justify-center rounded border",
                      checked
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300",
                    )}
                  >
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span
                    className={clsx("h-1.5 w-1.5 rounded-full", DOT_CLASS[o.tone])}
                  />
                  <span className="text-xs text-gray-700">{o.label}</span>
                </span>
                <span
                  className="text-[11px] tabular-nums text-gray-400"
                  title={`${(countFor[o.value] ?? 0).toLocaleString()} customers`}
                >
                  {formatCompactCount(countFor[o.value] ?? 0)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
