"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import clsx from "clsx";

type Option = { label: string; value: string };

/**
 * Compact multi-select dropdown styled to match the customers filter row:
 * a small button showing the selection summary, opening a searchable checkbox
 * list. Selection is a plain string[]; the parent owns the state.
 */
export default function MultiSelectFilter({
  selected,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search…",
  noun = "selected",
}: {
  selected: string[];
  onChange: (values: string[]) => void;
  options: Option[];
  placeholder: string;
  searchPlaceholder?: string;
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(value: string) {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} ${noun}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
          selected.length > 0
            ? "border-gray-300 bg-white text-gray-900"
            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
        )}
      >
        {label}
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-gray-200 bg-white py-1 pl-7 pr-2 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                  >
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
                    <span className="text-xs text-gray-700">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-gray-100 p-2">
              <button
                onClick={() => onChange([])}
                className="w-full rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              >
                Clear {selected.length} {noun}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
