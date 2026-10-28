"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Loader2, RefreshCw, ShoppingCart, AlertTriangle, ChevronDown } from "lucide-react";
import { useBomData } from "@/components/inventory/purchasing/useBomData";
import { buildable, materialCost, unitCost } from "@/lib/bomPlan";

const fmt = (n: number, max = 0) =>
  n.toLocaleString("en-US", { maximumFractionDigits: max });
const money = (n: number, max = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: max });

/**
 * The product's bill of materials from Fishbowl: what goes into one unit, how
 * much of each component is on hand and on order (and where), how many units
 * that could build, the material cost, and which other products share each
 * component — the "double dip" view for purchasing.
 */
export default function BomSection({ part }: { part: string }) {
  const { universe, stockOf, whereUsed, pointbLive, loading, error, reload } = useBomData();
  const [openShared, setOpenShared] = useState<string | null>(null);

  const bom = universe?.boms[part];

  const summary = useMemo(() => {
    if (!universe || !bom) return null;
    const now = buildable(part, universe.boms, stockOf);
    const withPo = buildable(
      part,
      universe.boms,
      (p) => stockOf(p) + (universe.parts[p]?.onOrder ?? 0),
    );
    const cost = materialCost(part, universe.boms, universe.parts);
    return { now, withPo, cost };
  }, [universe, bom, part, stockOf]);

  if (loading && !universe) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading the bill of materials from Fishbowl…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Couldn&rsquo;t load the BOM: {error}
      </div>
    );
  }
  if (!universe) return null;
  if (!bom) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No active bill of materials for <span className="font-mono">{part}</span> in Fishbowl.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Can build now" value={fmt(summary?.now.units ?? 0)}
          sub={summary?.now.bottleneck ? `limited by ${summary.now.bottleneck}` : undefined} />
        <Kpi label="Incl. on order" value={fmt(summary?.withPo.units ?? 0)}
          sub={summary?.withPo.bottleneck ? `limited by ${summary.withPo.bottleneck}` : undefined} />
        <Kpi label="Material cost / unit" value={summary ? money(summary.cost.cost, 3) : "—"}
          sub={summary?.cost.missing.length ? `${summary.cost.missing.length} part(s) have no cost` : "from last vendor price"} />
        <Kpi label="Components" value={String(bom.lines.length)} sub={`BOM ${bom.bomNum}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>
          On hand counts the fillers and FMG{pointbLive ? ", plus Point B (live)" : " and Point B"}; Amazon stock is left out.
        </span>
        <button
          onClick={reload}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={12} className={clsx(loading && "animate-spin")} /> Refresh
        </button>
        <Link
          href={`/inventory/purchasing?part=${encodeURIComponent(part)}`}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-600 hover:bg-gray-50"
        >
          <ShoppingCart size={12} /> Plan a purchase
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
              <th className="px-3 py-2.5 font-medium">Component</th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 text-right font-medium">Per unit</th>
              <th className="px-3 py-2.5 text-right font-medium">On hand</th>
              <th className="px-3 py-2.5 text-right font-medium">On order</th>
              <th className="px-3 py-2.5 text-right font-medium" title="Finished units this component alone could cover">Covers</th>
              <th className="px-3 py-2.5 text-right font-medium">Unit cost</th>
              <th className="px-3 py-2.5 text-right font-medium">Cost / unit</th>
              <th className="px-3 py-2.5 font-medium">Shared with</th>
            </tr>
          </thead>
          <tbody>
            {bom.lines.map((l) => {
              const p = universe.parts[l.component];
              const isSub = !!universe.boms[l.component];
              const onHand = stockOf(l.component);
              const subBuild = isSub ? buildable(l.component, universe.boms, stockOf).units : 0;
              const covers = l.qtyPer > 0 ? Math.floor((onHand + subBuild) / l.qtyPer + 1e-9) : 0;
              const cost = unitCost(p);
              const others = (whereUsed.get(l.component) ?? []).filter((x) => x !== part);
              const isBottleneck = summary?.now.bottleneck === l.component;
              const locations = Object.entries(p?.stockByLocation ?? {})
                .map(([loc, q]) => `${loc}: ${fmt(q)}`)
                .join("\n");
              const pos = (p?.openPos ?? [])
                .map((o) => `PO ${o.po} (${o.status}${o.vendor ? `, ${o.vendor}` : ""}): ${fmt(o.remaining)}${o.due ? ` due ${o.due.slice(0, 10)}` : ""}`)
                .join("\n");
              return (
                <tr key={l.component} className={clsx("border-b border-gray-100 align-top", isBottleneck && "bg-amber-50")}>
                  <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
                    {isSub ? (
                      <Link href={`/products/${encodeURIComponent(l.component)}`} className="text-blue-700 hover:underline">
                        {l.component}
                      </Link>
                    ) : (
                      <span className="text-gray-700">{l.component}</span>
                    )}
                    {isBottleneck && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800">
                        <AlertTriangle size={9} /> bottleneck
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {p?.description || "—"}
                    {isSub && <div className="text-[10px] text-gray-400">Made from its own BOM — click to open</div>}
                    {p?.vendor && <div className="text-[10px] text-gray-400">{p.vendor}{p.leadTimeDays ? ` · ${p.leadTimeDays}d lead time` : ""}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(l.bomQty, 3)} {l.bomUom ?? ""}
                    {l.bomUom && p?.uom && l.bomUom !== p.uom && (
                      <div className="text-[10px] text-gray-400">= {fmt(l.qtyPer, 3)} {p.uom}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" title={locations || "None on hand"}>
                    {fmt(onHand)}
                    {isSub && subBuild > 0 && <div className="text-[10px] text-gray-400">+{fmt(subBuild)} buildable</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" title={pos || undefined}>
                    {p?.onOrder ? fmt(p.onOrder) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={clsx("px-3 py-2 text-right tabular-nums", isBottleneck ? "font-semibold text-amber-800" : "text-gray-700")}>
                    {fmt(covers)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    {isSub ? <span className="text-gray-300">rolled up</span> : cost !== null ? money(cost, 4) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    {isSub
                      ? money(materialCost(l.component, universe.boms, universe.parts).cost * l.qtyPer, 3)
                      : cost !== null
                        ? money(cost * l.qtyPer, 3)
                        : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {others.length === 0 ? (
                      <span className="text-gray-300">Only this product</span>
                    ) : (
                      <div>
                        <button
                          onClick={() => setOpenShared((s) => (s === l.component ? null : l.component))}
                          className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"
                        >
                          {others.length} other product{others.length === 1 ? "" : "s"}
                          <ChevronDown size={10} className={clsx("transition-transform", openShared === l.component && "rotate-180")} />
                        </button>
                        {openShared === l.component && (
                          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                            {others.map((o) => (
                              <li key={o}>
                                <Link href={`/products/${encodeURIComponent(o)}`} className="font-mono text-[10px] text-blue-700 hover:underline">
                                  {o}
                                </Link>
                                <span className="ml-1 text-[10px] text-gray-500">{universe.parts[o]?.description}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        Hover On hand for the stock by location and On order for the open POs. &ldquo;Covers&rdquo; is how many finished units that component alone could supply; the lowest one is the bottleneck.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="truncate text-[11px] text-gray-500" title={sub}>{sub}</div>}
    </div>
  );
}
