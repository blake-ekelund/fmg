"use client";

/* ════════════════════════════════════════════════════════════
   Fragrance multi-select — a gift set can carry several scents.

   Storage stays a single text column (the storefronts read
   `fragrance` as a string), so multiple picks are joined with
   ", " — "Sea Salt, Lavender Ylang". Options are every fragrance
   already used on this brand's products; typing a new name and
   pressing Enter adds it.
   ════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";

const SEP = ", ";

export function splitFragrances(v: string | null | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinFragrances(list: string[]): string {
  return list.join(SEP);
}

export default function FragranceMultiSelect({
  label,
  brand,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  brand: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const selected = useMemo(() => splitFragrances(value), [value]);
  const [known, setKnown] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Every fragrance already used by this brand (gift sets split apart).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inventory_products")
        .select("fragrance")
        .eq("brand", brand)
        .not("fragrance", "is", null);
      if (cancelled) return;
      const set = new Map<string, string>();
      for (const r of (data ?? []) as { fragrance: string | null }[]) {
        for (const f of splitFragrances(r.fragrance)) {
          const k = f.toLowerCase();
          if (!set.has(k) && k !== "n/a") set.set(k, f);
        }
      }
      setKnown([...set.values()].sort((a, b) => a.localeCompare(b)));
    })();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
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

  const isSelected = (f: string) => selected.some((s) => s.toLowerCase() === f.toLowerCase());

  function toggle(f: string) {
    const next = isSelected(f)
      ? selected.filter((s) => s.toLowerCase() !== f.toLowerCase())
      : [...selected, f];
    onChange(joinFragrances(next));
  }

  // Selected values that aren't in the brand list yet still show as options.
  const options = useMemo(() => {
    const all = [...known];
    for (const s of selected) if (!all.some((k) => k.toLowerCase() === s.toLowerCase())) all.push(s);
    return all.sort((a, b) => a.localeCompare(b));
  }, [known, selected]);

  const q = query.trim();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
  const canAdd = q.length > 0 && !q.includes(",") && !options.some((o) => o.toLowerCase() === q.toLowerCase());

  function addTyped() {
    if (!canAdd) return;
    onChange(joinFragrances([...selected, q]));
    setQuery("");
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={clsx(
            "flex min-h-[38px] w-full items-center gap-1.5 rounded-lg border bg-white py-1.5 pl-3 pr-9 text-left text-sm transition focus:outline-none",
            open ? "border-gray-300 ring-2 ring-gray-300" : "border-gray-200",
          )}
        >
          {selected.length === 0 ? (
            <span className="text-gray-400">{placeholder ?? "Select fragrances"}</span>
          ) : selected.length === 1 ? (
            <span className="truncate text-gray-900">{selected[0]}</span>
          ) : (
            <span className="flex min-w-0 flex-wrap gap-1">
              {selected.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                >
                  {s}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${s}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(s);
                    }}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <X size={11} />
                  </span>
                </span>
              ))}
            </span>
          )}
          <ChevronDown
            size={16}
            className={clsx(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (canAdd) addTyped();
                    else if (filtered.length === 1) toggle(filtered[0]);
                  }
                }}
                placeholder="Search or add a fragrance…"
                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.map((f) => {
                const on = isSelected(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggle(f)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span
                      className={clsx(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300",
                      )}
                    >
                      {on && <Check size={11} />}
                    </span>
                    <span className={on ? "font-medium text-gray-900" : "text-gray-700"}>{f}</span>
                  </button>
                );
              })}
              {canAdd && (
                <button
                  type="button"
                  onClick={addTyped}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                >
                  <Plus size={14} />
                  Add “{q}”
                </button>
              )}
              {filtered.length === 0 && !canAdd && (
                <div className="px-3 py-3 text-center text-xs text-gray-400">No fragrances yet — type one to add it.</div>
              )}
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="w-full border-t border-gray-100 px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}
