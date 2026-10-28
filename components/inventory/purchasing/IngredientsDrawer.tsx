"use client";

import { useMemo, useState } from "react";
import SlideOver from "./SlideOver";
import clsx from "clsx";
import { X, Search } from "lucide-react";
import type { BomPart } from "@/lib/fishbowlBom";
import { priceFor, type PartSetting, type VendorSetting } from "@/lib/bomPlan";
import { fmt, friendlyName } from "./purchasingText";

type Field = Record<string, number | string | null>;

/**
 * Side drawer: every ingredient in the family, grouped by vendor, with the
 * ordering rules you can change. The vendor row holds the run rules (minimum
 * run total, each item at least, lead time); each ingredient row holds its own
 * price, minimum, multiple and lead time. A blank box falls back to the
 * vendor's rule, then Fishbowl — the placeholder shows what's in effect.
 * Saves when you leave a box.
 */
export default function IngredientsDrawer({
  open,
  onClose,
  familyName,
  ingredients,
  partSettings,
  vendorSettings,
  save,
  ready,
  saveError,
}: {
  open: boolean;
  onClose: () => void;
  familyName: string;
  ingredients: { part: BomPart; vendor: string; usedBy: number }[];
  partSettings: Map<string, PartSetting>;
  vendorSettings: Map<string, VendorSetting>;
  save: (kind: "part" | "vendor", key: string, fields: Field) => void;
  ready: boolean;
  saveError: string | null;
}) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const g = new Map<string, typeof ingredients>();
    for (const i of ingredients) {
      if (needle && !`${i.part.part} ${i.part.description} ${i.vendor}`.toLowerCase().includes(needle)) continue;
      g.set(i.vendor, [...(g.get(i.vendor) ?? []), i]);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ingredients, q]);

  return (
    <SlideOver open={open} onClose={onClose} widthClass="max-w-[640px]">
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Ingredients &amp; minimums</h2>
            <p className="truncate text-sm text-gray-500">{familyName} · {ingredients.length} ingredients</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 border-b border-gray-100 px-5 py-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find an ingredient or vendor…"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <p className="text-xs text-gray-500">Blank = use the vendor&rsquo;s rule, then Fishbowl. The grey number shows what&rsquo;s in effect. Saves when you leave a box.</p>
          {!ready && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Changes apply now but won&rsquo;t be saved until the purchasing-settings migration is applied (supabase db push).
            </p>
          )}
          {saveError && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{saveError}</p>}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {groups.map(([vendor, items]) => {
            const vs = vendorSettings.get(vendor);
            return (
              <section key={vendor}>
                <div className="rounded-t-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <div className="text-sm font-semibold text-gray-900">{vendor}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <NumBox label="Run minimum" suffix="units" value={vs?.min_run_qty} placeholder="none"
                      title="The whole order to this vendor must reach this many units (e.g. Kapra's batch size)"
                      onCommit={(v) => save("vendor", vendor, { min_run_qty: v })} />
                    <NumBox label="Each item at least" suffix="units" value={vs?.item_min_qty} placeholder="none"
                      title="Every item on the order at least this many (e.g. 500 of each fragrance)"
                      onCommit={(v) => save("vendor", vendor, { item_min_qty: v })} />
                    <NumBox label="Lead time" suffix="days" value={vs?.lead_days} placeholder="Fishbowl"
                      onCommit={(v) => save("vendor", vendor, { lead_days: v })} />
                  </div>
                </div>
                <div className="divide-y divide-gray-100 rounded-b-lg border border-t-0 border-gray-200">
                  <div className="grid grid-cols-[minmax(0,1fr)_76px_70px_64px_58px] gap-2 px-3 pt-2 text-[10px] uppercase tracking-wide text-gray-400">
                    <span>Ingredient</span><span className="text-right">Price</span><span className="text-right">Min</span><span className="text-right">Multiple</span><span className="text-right">Lead</span>
                  </div>
                  {items.map(({ part, usedBy }) => {
                    const ps = partSettings.get(part.part);
                    const fb = priceFor(part);
                    const effMin = vs?.item_min_qty ?? part.moq;
                    return (
                      <div key={part.part} className="grid grid-cols-[minmax(0,1fr)_76px_70px_64px_58px] items-center gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-gray-900" title={part.description}>{friendlyName(part.description, part.part)}</div>
                          <div className="truncate text-xs text-gray-400">
                            {fb.price !== null
                              ? `$${fb.price.toFixed(fb.price < 1 ? 3 : 2)} ${fb.source}${fb.date ? ` ${fb.date.slice(0, 7)}` : ""}`
                              : "no price in Fishbowl"}
                            {usedBy > 1 && ` · in ${usedBy} products`}
                          </div>
                        </div>
                        <NumBox compact value={ps?.unit_price} placeholder={fb.price !== null ? fb.price.toFixed(fb.price < 1 ? 3 : 2) : "—"} prefix="$" decimals
                          onCommit={(v) => save("part", part.part, { unit_price: v })} />
                        <NumBox compact value={ps?.min_qty} placeholder={effMin ? fmt(effMin) : "—"}
                          onCommit={(v) => save("part", part.part, { min_qty: v })} />
                        <NumBox compact value={ps?.multiple} placeholder="—"
                          onCommit={(v) => save("part", part.part, { multiple: v })} />
                        <NumBox compact value={ps?.lead_days} placeholder={String(vs?.lead_days ?? part.leadTimeDays ?? "—")}
                          onCommit={(v) => save("part", part.part, { lead_days: v })} />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {groups.length === 0 && <p className="text-sm text-gray-400">No ingredients match.</p>}
        </div>
    </SlideOver>
  );
}

/** A number box that saves on blur; blank clears the override. */
function NumBox({
  label, suffix, value, placeholder, onCommit, compact, prefix, decimals, title,
}: {
  label?: string;
  suffix?: string;
  value: number | null | undefined;
  placeholder: string;
  onCommit: (v: number | null) => void;
  compact?: boolean;
  prefix?: string;
  decimals?: boolean;
  title?: string;
}) {
  const initial = value == null ? "" : String(value);
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  // Follow outside changes (e.g. settings loading) without fighting the typist.
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }

  const commit = () => {
    const cleaned = text.replace(decimals ? /[^\d.]/g : /[^\d]/g, "");
    const next = cleaned === "" ? null : Number(cleaned);
    const prev = value ?? null;
    if (next !== prev && (next === null || Number.isFinite(next))) onCommit(next);
  };

  const input = (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{prefix}</span>}
      <input
        inputMode={decimals ? "decimal" : "numeric"}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={clsx(
          "w-full rounded-md border px-1.5 text-right tabular-nums placeholder:text-gray-300 outline-none focus:ring-2 focus:ring-gray-300",
          compact ? "h-7 text-sm" : "h-8 text-sm",
          prefix && "pl-4",
          value != null ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white",
        )}
      />
    </div>
  );

  if (compact) return input;
  return (
    <label className="block" title={title}>
      <span className="mb-0.5 block text-[11px] text-gray-500">{label}{suffix ? ` (${suffix})` : ""}</span>
      {input}
    </label>
  );
}
