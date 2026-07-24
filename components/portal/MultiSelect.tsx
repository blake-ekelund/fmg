"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "@/components/portal/icons";

/**
 * A compact multi-select dropdown for table filters (Collection, Product, …).
 * Empty selection = no filter. Closes on outside click or Escape; the button
 * shows the label and a count once anything is picked.
 */
export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  }

  const count = selected.size;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          count > 0
            ? "border-gray-900 bg-gray-900 text-white"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
        }`}
      >
        {label}
        {count > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] leading-none tabular-nums">
            {count}
          </span>
        )}
        <ChevronDown size={13} className={count > 0 ? "text-white/70" : "text-gray-400"} />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {count > 0 && (
            <button
              onClick={() => onChange(new Set())}
              className="mb-1 w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-gray-400">None available</p>
          ) : (
            options.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"
                    }`}
                  >
                    {on && <Check size={11} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
