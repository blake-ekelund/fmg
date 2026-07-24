"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { InventoryStatus } from "./types";

/**
 * Mobile's replacement for the status pill row.
 *
 * Five pills don't fit a phone, and unlike the pills this is genuinely
 * multi-select — "at risk plus review" is the question someone actually asks
 * when deciding what to reorder, and the pills could never express it.
 *
 * An empty selection means "all", which keeps the cleared state and the
 * everything state as one thing rather than two that can disagree.
 */

export type StatusOption = {
  value: InventoryStatus;
  label: string;
  /** Dot colour, matched to the desktop pills so the two read as one system. */
  dotClass: string;
};

type Props = {
  options: StatusOption[];
  selected: Set<InventoryStatus>;
  counts: Record<InventoryStatus, number>;
  totalCount: number;
  onChange: (next: Set<InventoryStatus>) => void;
  className?: string;
};

export default function StatusFilterDropdown({
  options,
  selected,
  counts,
  totalCount,
  onChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: InventoryStatus) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  const label =
    selected.size === 0
      ? "All statuses"
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? "1 status")
        : `${selected.size} statuses`;

  const shownCount = selected.size === 0
    ? totalCount
    : options.reduce((s, o) => (selected.has(o.value) ? s + counts[o.value] : s), 0);

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={clsx(
          "inline-flex w-full items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium transition",
          selected.size > 0
            ? "border-gray-900 text-gray-900"
            : "border-gray-200 text-gray-600",
        )}
      >
        <SlidersHorizontal size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] leading-none tabular-nums text-gray-500">
            {shownCount}
          </span>
          <ChevronDown
            size={12}
            className={clsx("transition-transform duration-150", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {selected.size === 0 && <Check size={14} className="text-gray-900" />}
            </span>
            <span
              className={clsx(
                "flex-1",
                selected.size === 0 ? "font-medium text-gray-900" : "text-gray-600",
              )}
            >
              All statuses
            </span>
            <span className="text-xs tabular-nums text-gray-400">{totalCount}</span>
          </button>

          <div className="border-t border-gray-100">
            {options.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {on && <Check size={14} className="text-gray-900" />}
                  </span>
                  <span
                    className={clsx("h-2 w-2 shrink-0 rounded-full", o.dotClass)}
                  />
                  <span
                    className={clsx(
                      "flex-1 capitalize",
                      on ? "font-medium text-gray-900" : "text-gray-600",
                    )}
                  >
                    {o.label}
                  </span>
                  <span className="text-xs tabular-nums text-gray-400">
                    {counts[o.value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
