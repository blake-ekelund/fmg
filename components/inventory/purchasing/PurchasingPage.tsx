"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Loader2, RefreshCw, Search, Download, Copy, Check, ChevronDown, ChevronRight, Layers, SlidersHorizontal, AlertTriangle, FileDown, Printer, X } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { useForecastData } from "@/components/inventory/forecasting/hooks/useForecastData";
import StatusFilterDropdown from "@/components/inventory/forecasting/StatusFilterDropdown";
import {
  type InventoryStatus,
  type ForecastRow,
  STATUS_RANK,
} from "@/components/inventory/forecasting/types";
import { useBomData } from "./useBomData";
import {
  NO_VENDOR,
  planFamily as planFamilyFor,
  rankFamilies,
  sendToKapra,
  toPlanRow,
  vendorOrders,
  type BuyLine,
  type VendorOrder,
  type PlanContext,
  type PlanRow,
} from "@/lib/purchasingPlan";
import { usePurchasingSettings } from "./usePurchasingSettings";
import IngredientsDrawer from "./IngredientsDrawer";
import SlideOver from "@/components/ui/SlideOver";
import {
  FILLER_LOCATION,
  awayFromFiller,
  bomFamilies,
  buildable,
  isFill,
  topUpToRun,
  vendorFor,
  type Boms,
  type Family,
  type PartSetting,
  type VendorSetting,
  type Requirement,
} from "@/lib/bomPlan";
import type { BomPart } from "@/lib/fishbowlBom";
import { URGENCY_STYLE, fmt, friendlyName, money, unitWord } from "./purchasingText";
import { supabase } from "@/lib/supabaseClient";
import type { PoDefaults } from "@/lib/fishbowlPoDefaults";
import { buildPoHtml, buildPoImportCsv, headerFor, type PurchaseOrderDraft } from "@/lib/poExport";


/* Each vendor's usual PO header (from its last Fishbowl PO), fetched the first
   time someone makes a PO and reused for the visit. */
let poDefaultsCache: Promise<PoDefaults> | null = null;
function fetchPoDefaults(): Promise<PoDefaults> {
  poDefaultsCache ??= (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/inventory/po-defaults", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? `Couldn't read vendor PO details (${res.status})`);
    return json as PoDefaults;
  })().catch((e) => {
    poDefaultsCache = null;
    throw e;
  });
  return poDefaultsCache;
}

/* Same statuses, colours and wording as the Inventory page. */
const STATUS_OPTIONS: { value: InventoryStatus; label: string; dotClass: string }[] = [
  { value: "at risk", label: "At risk", dotClass: "bg-red-500" },
  { value: "needs review", label: "Review", dotClass: "bg-amber-500" },
  { value: "healthy", label: "Healthy", dotClass: "bg-green-500" },
  { value: "no demand", label: "No demand", dotClass: "bg-gray-400" },
];
const STATUS_DOT: Record<InventoryStatus, string> = {
  "at risk": "bg-red-500",
  "needs review": "bg-amber-400",
  healthy: "bg-green-500",
  "no demand": "bg-gray-300",
};
const DEFAULT_STATUSES: InventoryStatus[] = ["at risk", "needs review"];

type Row = PlanRow & { p: ForecastRow };

/**
 * Purchasing, one SKU family at a time.
 *
 * A family = products that share a real ingredient (or a product line) — see
 * bomFamilies(). Pick a family on the left; the middle is that family's
 * products in the Inventory page's own terms (status, months left), with how
 * many each could make from ingredients on hand and an editable Make; the
 * right is the family's order list, one line per vendor, coloured by how soon
 * it has to go out. Read-only: nothing is ordered in Fishbowl.
 */
export default function PurchasingPage({
  initialPart,
  initialStatuses,
}: {
  initialPart?: string;
  initialStatuses?: InventoryStatus[];
}) {
  const { rows: products, loading: productsLoading } = useForecastData();
  const { universe, stockOf, whereUsed, loading: bomLoading, error, reload } = useBomData();
  const { partSettings, vendorSettings, save, ready: settingsReady, saveError } = usePurchasingSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [targetMonths, setTargetMonths] = useState(6);
  const [statusFilter, setStatusFilter] = useState<Set<InventoryStatus>>(
    () => new Set(initialPart ? [] : (initialStatuses ?? DEFAULT_STATUSES)),
  );
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [makeOverride, setMakeOverride] = useState<Map<string, number>>(new Map());
  const [buyOverride, setBuyOverride] = useState<Map<string, number>>(new Map());
  const [openRow, setOpenRow] = useState<string | null>(initialPart ?? null);

  const boms = universe?.boms;
  const parts = useMemo(() => universe?.parts ?? {}, [universe]);
  const supply = useMemo(
    () => (p: string) => stockOf(p) + (parts[p]?.onOrder ?? 0),
    [stockOf, parts],
  );

  /* ─── Every plannable product, in Inventory-page terms ─── */

  const rows = useMemo<Row[]>(() => {
    if (!boms) return [];
    return products
      .filter((p) => !!boms[p.part])
      .map((p) => ({
        ...toPlanRow(p.part, p.display_name || p.part, p.on_hand, p.on_order, p.avg_monthly_demand, targetMonths),
        p,
      }));
  }, [products, boms, targetMonths]);
  const rowOf = useMemo(() => new Map(rows.map((r) => [r.p.part, r])), [rows]);

  const families = useMemo<Family[]>(() => {
    if (!boms) return [];
    return bomFamilies(
      boms,
      parts,
      rows.map((r) => ({ part: r.p.part, line: r.name.replace(/^TESTER\s+/i, "") })),
    );
  }, [boms, parts, rows]);

  /* A product is in the plan when its status is ticked (nothing ticked = all)
     or someone typed a Make for it. */
  const makeFor = useMemo(
    () => (r: PlanRow) => {
      const o = makeOverride.get(r.part);
      if (o !== undefined) return o;
      return statusFilter.size === 0 || statusFilter.has(r.status) ? r.suggested : 0;
    },
    [makeOverride, statusFilter],
  );

  /* ─── Plan + order list for one family ─── */

  /* The plan maths lives in lib/purchasingPlan.ts — shared with Sage. */
  const planCtx = useMemo<PlanContext | null>(
    () =>
      boms
        ? { boms, parts, supply, rowOf, makeFor, partSettings, vendorSettings, buyOverride }
        : null,
    [boms, parts, supply, rowOf, makeFor, partSettings, vendorSettings, buyOverride],
  );
  const planFamily = useMemo(
    () => (fam: Family) =>
      planCtx ? planFamilyFor(fam, planCtx) : { plan: new Map<string, number>(), req: new Map<string, Requirement>(), lines: [] as BuyLine[] },
    [planCtx],
  );

  /* Rail summary per family, most urgent first. */
  const familyCards = useMemo(() => (planCtx ? rankFamilies(families, planCtx) : []), [families, planCtx]);

  const selectedId =
    picked ??
    (initialPart ? families.find((f) => f.parts.includes(initialPart))?.id : undefined) ??
    familyCards[0]?.f.id ??
    null;
  const family = families.find((f) => f.id === selectedId) ?? null;
  const current = useMemo(() => (family ? planFamily(family) : null), [family, planFamily]);

  /* ─── Middle table ─── */

  const tableRows = useMemo(() => {
    if (!family) return [];
    const q = search.trim().toLowerCase();
    return family.parts
      .map((p) => rowOf.get(p))
      .filter((r): r is Row => !!r)
      .filter((r) => !q || `${r.p.part} ${r.name} ${r.p.fragrance ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.cover ?? 99) - (b.cover ?? 99));
  }, [family, rowOf, search]);

  const statusCounts = useMemo(() => {
    const c: Record<InventoryStatus, number> = { "at risk": 0, "needs review": 0, healthy: 0, "no demand": 0 };
    for (const p of family?.parts ?? []) {
      const s = rowOf.get(p)?.status;
      if (s) c[s]++;
    }
    return c;
  }, [family, rowOf]);

  const afterSupply = useMemo(() => {
    const buys = new Map((current?.lines ?? []).filter((l) => l.urgency !== "check").map((l) => [l.r.part, l.buy]));
    return (p: string) => supply(p) + (buys.get(p) ?? 0);
  }, [current, supply]);

  /* Every ingredient in the family (down through sub-assemblies), for the drawer. */
  const familyIngredients = useMemo(() => {
    if (!family || !boms) return [];
    const seen = new Set<string>();
    const walk = (p: string, depth: number) => {
      if (depth > 12) return;
      for (const l of boms[p]?.lines ?? []) {
        if (boms[l.component]) walk(l.component, depth + 1);
        else seen.add(l.component);
      }
    };
    for (const p of family.parts) walk(p, 0);
    return [...seen]
      .map((c) => parts[c])
      .filter((p): p is BomPart => !!p)
      .map((p) => ({ part: p, vendor: vendorFor(p) ?? NO_VENDOR, usedBy: whereUsed.get(p.part)?.length ?? 0 }))
      .sort((a, b) => a.part.description.localeCompare(b.part.description));
  }, [family, boms, parts, whereUsed]);

  const setMake = (part: string, v: number) =>
    setMakeOverride((m) => new Map(m).set(part, Math.max(0, Math.round(v) || 0)));
  const setBuy = (part: string, v: number) =>
    setBuyOverride((m) => new Map(m).set(part, Math.max(0, Math.round(v) || 0)));

  const loading = productsLoading || (bomLoading && !universe);
  const familyName = (f: Family) => f.lines.slice(0, 2).join(" & ") + (f.lines.length > 2 ? ` +${f.lines.length - 2}` : "");

  return (
    <div className="space-y-4">
      <PageMeta title="Purchasing" description="Order ingredients one product family at a time, from Fishbowl recipes, stock and open POs." />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Couldn&rsquo;t load the recipes from Fishbowl: {error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <Loader2 size={15} className="animate-spin" /> Working out what to order…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_360px]">
          {/* ─── Families ─── */}
          <aside className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Families</h2>
              <button onClick={reload} title="Re-read recipes, stock and open POs from Fishbowl" className="text-gray-400 hover:text-gray-700">
                <RefreshCw size={13} className={clsx(bomLoading && "animate-spin")} />
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {familyCards.map((c) => (
                <button
                  key={c.f.id}
                  onClick={() => { setPicked(c.f.id); setOpenRow(null); setSearch(""); }}
                  className={clsx(
                    "min-w-[190px] rounded-xl border px-3 py-2 text-left transition lg:min-w-0",
                    c.f.id === selectedId ? "border-gray-900 bg-white shadow-sm" : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                >
                  <div className="truncate text-sm font-medium text-gray-900" title={c.f.lines.join(", ")}>{familyName(c.f)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    {c.atRisk > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{c.atRisk}</span>}
                    {c.review > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{c.review}</span>}
                    <span>{c.f.parts.length} products</span>
                    {c.cost > 0 && <span className={clsx("ml-auto font-medium", c.now > 0 ? "text-red-700" : "text-gray-700")}>{money(c.cost)}</span>}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* ─── The family's products ─── */}
          <section className="min-w-0 space-y-3">
            {family && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="mr-2 text-lg font-semibold text-gray-900">{familyName(family)}</h1>
                  <div className="relative w-[200px]">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search this family…"
                      className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                  <StatusFilterDropdown
                    className="w-[190px]"
                    options={STATUS_OPTIONS}
                    selected={statusFilter}
                    counts={statusCounts}
                    totalCount={family.parts.length}
                    onChange={(next) => { setStatusFilter(next); setMakeOverride(new Map()); }}
                  />
                  <button
                    onClick={() => setDrawerOpen(true)}
                    className="order-last inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:order-none sm:ml-auto"
                    title="Prices, minimums and lead times for this family's ingredients"
                  >
                    <SlidersHorizontal size={14} /> Ingredients &amp; minimums
                  </button>
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600" title="Make enough to cover this many months of sales">
                    Stock for
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={targetMonths}
                      onChange={(e) => setTargetMonths(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                      className="w-11 rounded border border-gray-200 px-1 text-right tabular-nums"
                    />
                    months
                  </label>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                        <th className="w-8 px-2 py-2.5" />
                        <th className="px-2 py-2.5 font-medium">Product</th>
                        <th className="px-2 py-2.5 text-right font-medium">On Hand</th>
                        <th className="px-2 py-2.5 text-right font-medium">On Order</th>
                        <th className="px-2 py-2.5 text-right font-medium">Avg / Mo</th>
                        <th className="px-2 py-2.5 text-right font-medium">Months left</th>
                        <th className="px-2 py-2.5 text-right font-medium" title="Units the ingredients on hand (and on order) could make — then after this order">Can make</th>
                        <th className="px-2 py-2.5 text-right font-medium">Make</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => (
                        <ProductRow
                          key={r.p.part}
                          r={r}
                          make={makeFor(r)}
                          overridden={makeOverride.has(r.p.part)}
                          onMake={(v) => setMake(r.p.part, v)}
                          open={openRow === r.p.part}
                          onToggle={() => setOpenRow((o) => (o === r.p.part ? null : r.p.part))}
                          boms={boms!}
                          parts={parts}
                          supply={supply}
                          afterSupply={afterSupply}
                          req={current?.req}
                          whereUsed={whereUsed}
                          stockOf={stockOf}
                        />
                      ))}
                    </tbody>
                  </table>
                  {tableRows.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No products match.</div>}
                </div>
              </>
            )}
          </section>

          {/* ─── Order list ─── */}
          <aside className="lg:col-span-2 xl:col-span-1">
            <div className="xl:sticky xl:top-4">
              {family && current && (
                <OrderList
                  familyName={familyName(family)}
                  lines={current.lines}
                  req={current.req}
                  parts={parts}
                  nameOf={(p) => rowOf.get(p)?.name ?? parts[p]?.description ?? p}
                  onBuy={setBuy}
                  overridden={(p) => buyOverride.has(p)}
                  vendorSettings={vendorSettings}
                  partSettings={partSettings}
                  onEditRules={() => setDrawerOpen(true)}
                />
              )}
            </div>
          </aside>
        </div>
      )}

      {family && (
        <IngredientsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          familyName={familyName(family)}
          ingredients={familyIngredients}
          partSettings={partSettings}
          vendorSettings={vendorSettings}
          save={save}
          ready={settingsReady}
          saveError={saveError}
        />
      )}
    </div>
  );
}

/* ─── One product row, with its recipe on click ─────────────────────────── */

function ProductRow({
  r, make, overridden, onMake, open, onToggle, boms, parts, supply, afterSupply, req, whereUsed, stockOf,
}: {
  r: Row;
  make: number;
  overridden: boolean;
  onMake: (v: number) => void;
  open: boolean;
  onToggle: () => void;
  boms: Boms;
  parts: Record<string, BomPart>;
  supply: (p: string) => number;
  afterSupply: (p: string) => number;
  req: Map<string, Requirement> | undefined;
  whereUsed: Map<string, string[]>;
  stockOf: (p: string) => number;
}) {
  const now = buildable(r.p.part, boms, supply);
  const after = buildable(r.p.part, boms, afterSupply).units;
  const cover = r.cover;
  const coverClass = cover === null ? "text-gray-400" : cover <= 1.5 ? "text-red-700 font-medium" : cover <= 3 ? "text-amber-700" : "text-gray-700";
  const bom = boms[r.p.part];

  return (
    <>
      <tr onClick={onToggle} className={clsx("cursor-pointer border-b border-gray-100 hover:bg-gray-50", r.status === "at risk" && "bg-red-50/60")}>
        <td className="px-2 py-2 text-center">
          <span title={r.status} className={clsx("inline-block h-2 w-2 rounded-full", STATUS_DOT[r.status])} />
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <ChevronRight size={13} className={clsx("shrink-0 text-gray-400 transition-transform", open && "rotate-90")} />
            <span className="font-medium text-gray-900">{r.name}</span>
          </div>
          <div className="pl-[17px] text-xs text-gray-400">{r.p.part}{r.p.fragrance ? ` · ${r.p.fragrance}` : ""}</div>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{fmt(r.p.on_hand)}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-600">{r.p.on_order ? fmt(r.p.on_order) : "—"}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmt(r.p.avg_monthly_demand)}</td>
        <td className={clsx("px-2 py-2 text-right tabular-nums", coverClass)}>{cover === null ? "—" : cover >= 99 ? "99+" : cover.toFixed(1)}</td>
        <td
          className="px-2 py-2 text-right tabular-nums"
          title={now.bottleneck ? `Runs out of: ${friendlyName(parts[now.bottleneck]?.description, now.bottleneck)}` : undefined}
        >
          <span className={clsx(make > 0 && now.units < make ? "text-red-700" : "text-gray-800")}>{fmt(now.units)}</span>
          {after > now.units && <span className="text-green-700"> → {fmt(after)}</span>}
        </td>
        <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <input
            inputMode="numeric"
            value={make === 0 ? "" : String(make)}
            placeholder="0"
            onChange={(e) => onMake(Number(e.target.value.replace(/[^\d]/g, "")))}
            className={clsx(
              "h-8 w-20 rounded-md border px-2 text-right tabular-nums outline-none focus:ring-2 focus:ring-gray-300",
              overridden ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50",
            )}
          />
        </td>
      </tr>
      {open && bom && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={8} className="px-4 pb-4 pt-1 sm:pl-10">
            <div className="mb-1.5 text-xs font-medium text-gray-500">What goes into one</div>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {bom.lines.map((l) => {
                const p = parts[l.component];
                const need = req?.get(l.component);
                const shared = (whereUsed.get(l.component) ?? []).length;
                const isSub = !!boms[l.component];
                const name = friendlyName(p?.description, l.component);
                const per = perUnitText(l.bomQty, l.bomUom);
                const where = whereText(p, isSub);
                return (
                  <div key={l.component} className="grid grid-cols-[minmax(0,1fr)_72px_72px_92px] items-center gap-x-4 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-gray-900" title={p?.description ?? l.component}>
                        {isSub ? (
                          <Link href={`/products/${encodeURIComponent(l.component)}`} className="text-blue-700 hover:underline">{name}</Link>
                        ) : name}
                        {per && <span className="text-gray-400"> · {per}</span>}
                      </div>
                      <div className="truncate text-xs text-gray-400">
                        {where}
                        {shared > 1 && ` · used in ${shared} products`}
                      </div>
                    </div>
                    <Figure label="Have" value={fmt(stockOf(l.component))} />
                    <Figure label="Needed" value={need ? fmt(Math.ceil(need.needed)) : "—"} />
                    <div className="text-right">
                      {need?.short ? (
                        <span className="inline-block rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium tabular-nums text-red-700">
                          Short {fmt(Math.ceil(need.short))}
                        </span>
                      ) : need ? (
                        <span className="inline-block rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">OK</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm tabular-nums text-gray-800">{value}</div>
    </div>
  );
}

/** "1 6thb" → "1 per 6"; nothing for a plain 1 each. */
function perUnitText(qty: number, uom: string | null): string {
  const u = (uom ?? "").toLowerCase();
  const m = u.match(/^(\d+)thb$/);
  if (m) return qty === 1 ? `1 per ${m[1]}` : `${qty} per ${m[1]}`;
  if (u === "" || u === "ea") return qty === 1 ? "" : `${qty} per unit`;
  return `${qty} ${uom} per unit`;
}

/** Where the ingredient is, in a few words. */
function whereText(p: BomPart | undefined, isSub: boolean): string {
  if (isFill(p)) return "Made by Kapra";
  if (isSub) return "Made from its own recipe";
  const atKapra = p?.stockByLocation[FILLER_LOCATION] ?? 0;
  const away = awayFromFiller(p);
  if (!atKapra && !away.length) return "None on hand";
  const bits = [...(atKapra ? [`${fmt(atKapra)} at Kapra`] : []), ...away.map((a) => `${fmt(a.qty)} at ${a.location}`)];
  return bits.join(" · ");
}

/* ─── The family's order list ───────────────────────────────────────────── */

function OrderList({
  familyName, lines, req, parts, nameOf, onBuy, overridden, vendorSettings, partSettings, onEditRules,
}: {
  familyName: string;
  lines: BuyLine[];
  req: Map<string, Requirement>;
  parts: Record<string, BomPart>;
  nameOf: (p: string) => string;
  onBuy: (part: string, v: number) => void;
  overridden: (part: string) => boolean;
  vendorSettings: Map<string, VendorSetting>;
  partSettings: Map<string, PartSetting>;
  onEditRules: () => void;
}) {
  const [openVendor, setOpenVendor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const [showKapra, setShowKapra] = useState(false);

  const ordering = lines.filter((l) => l.urgency !== "check");
  const toCheck = lines.filter((l) => l.urgency === "check");

  const vendors = useMemo(() => vendorOrders(lines, vendorSettings), [lines, vendorSettings]);
  // The drawer keeps the last vendor while it slides closed, so it never blanks mid-animation.
  const [shownVendor, setShownVendor] = useState<string | null>(null);
  const openOrder = vendors.find((v) => v.vendor === (openVendor ?? shownVendor)) ?? null;

  const total = ordering.reduce((s, l) => s + (l.lineCost ?? 0), 0);

  const toKapra = useMemo(
    () =>
      sendToKapra(req, parts).map((t) => {
        const p = parts[t.part];
        const unit = unitWord(p?.uom, t.qty);
        return {
          part: t.part,
          text: `${fmt(t.qty)}${unit ? ` ${unit}` : ""} ${friendlyName(p?.description, t.part)} — from ${t.from.join(" & ")}`,
        };
      }),
    [req, parts],
  );

  /* ─── Fishbowl POs ─── */

  const [poBusy, setPoBusy] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);

  function draftFor(v: (typeof vendors)[number], defaults: PoDefaults | null): PurchaseOrderDraft {
    const today = new Date();
    return {
      vendor: v.vendor,
      header: headerFor(v.vendor, defaults),
      lines: v.items.map((i) => {
        const due = new Date(today);
        due.setDate(due.getDate() + i.leadDays);
        return {
          part: i.r.part,
          description: i.part?.description ?? i.r.part,
          vendorPartNumber: i.part?.vendorPartNumber ?? null,
          qty: i.buy,
          uom: i.part?.uom ?? null,
          unitPrice: i.cost,
          dueDate: due.toISOString().slice(0, 10),
          // Like Fishbowl's own Kapra POs: name the finished products it's for.
          note: i.r.usedBy.map((u) => `${u} ${nameOf(u)}`).join("; ").slice(0, 250),
        };
      }),
    };
  }

  async function poFiles(list: typeof vendors) {
    if (list.length === 0) return;
    setPoBusy(true);
    setPoError(null);
    try {
      const defaults = await fetchPoDefaults();
      const today = new Date().toISOString().slice(0, 10);
      const csv = buildPoImportCsv(list.map((v) => draftFor(v, defaults)), today);
      const name = list.length === 1 ? list[0].vendor : familyName;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `fishbowl_po_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPoError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoBusy(false);
    }
  }

  async function printPo(v: (typeof vendors)[number]) {
    // Open the window first (inside the click) so pop-up blockers allow it.
    const w = window.open("", "_blank");
    setPoBusy(true);
    setPoError(null);
    try {
      const defaults = await fetchPoDefaults();
      const html = buildPoHtml(draftFor(v, defaults), new Date().toISOString().slice(0, 10));
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }
    } catch (e) {
      w?.close();
      setPoError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoBusy(false);
    }
  }

  async function copyOrder(v: (typeof vendors)[number]) {
    const text = [
      `Order for ${v.vendor}`,
      "",
      ...v.items.map((i) => {
        const unit = unitWord(i.part?.uom, i.buy);
        const vpn = i.part?.vendorPartNumber && i.part.vendorPartNumber !== i.r.part ? ` (your #${i.part.vendorPartNumber})` : "";
        return `- ${fmt(i.buy)}${unit ? ` ${unit}` : ""} — ${i.part?.description ?? i.r.part} [our part ${i.r.part}]${vpn}`;
      }),
      "",
      `Estimated total: ${money(v.total)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(v.vendor);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  function exportCsv() {
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const out = [["Vendor", "Urgency", "Part", "Description", "Buy", "Unit", "Unit cost", "Line cost", "Lead time (days)", "For products"].join(",")];
    for (const v of vendors)
      for (const i of v.items)
        out.push([v.vendor, URGENCY_STYLE[i.urgency].label, i.r.part, i.part?.description ?? "", i.buy, i.part?.uom ?? "", i.cost ?? "", i.lineCost?.toFixed(2) ?? "", i.leadDays, i.r.usedBy.join(" ")].map(cell).join(","));
    const url = URL.createObjectURL(new Blob([out.join("\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `order_${familyName.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Order list</div>
          {ordering.length === 0 ? (
            <div className="mt-1 text-sm text-gray-600">Nothing to order for the ticked products.</div>
          ) : (
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-gray-900">{money(total)}</span>
              <span className="text-sm text-gray-500">{vendors.length} vendor{vendors.length === 1 ? "" : "s"} · {ordering.length} item{ordering.length === 1 ? "" : "s"}</span>
            </div>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {vendors.map((v) => {
            const under = v.runMin !== null && v.units < v.runMin;
            return (
              <button
                key={v.vendor}
                onClick={() => { setOpenVendor(v.vendor); setShownVendor(v.vendor); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", URGENCY_STYLE[v.worst].dot)} title={URGENCY_STYLE[v.worst].label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{v.vendor}</span>
                  <span className={clsx("block truncate text-xs", under ? "font-medium text-amber-700" : "text-gray-500")}>
                    {under
                      ? `${fmt((v.runMin as number) - v.units)} under minimum`
                      : `${v.items.length} item${v.items.length === 1 ? "" : "s"} · ~${v.weeks} wk${v.guessed ? "?" : ""}`}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900">{money(v.total)}</span>
                <ChevronRight size={15} className="shrink-0 text-gray-300" />
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2.5">
          {ordering.length > 0 && (
            <button
              onClick={() => poFiles(vendors.filter((v) => v.vendor !== NO_VENDOR))}
              disabled={poBusy}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:underline disabled:opacity-50"
              title="Every vendor's PO in one Fishbowl import file"
            >
              <FileDown size={14} /> All vendors as Fishbowl POs
            </button>
          )}
          {ordering.length > 0 && (
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
              <Download size={14} /> Spreadsheet
            </button>
          )}
          <button onClick={onEditRules} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
            <SlidersHorizontal size={14} /> Minimums &amp; prices
          </button>
          {poError && <p className="w-full text-xs text-red-700">{poError}</p>}
        </div>
      </div>

      {toKapra.length > 0 && (
        <Collapsible title={`Send to Kapra first (${toKapra.length})`} open={showKapra} onToggle={() => setShowKapra((s) => !s)} icon={<Layers size={14} />}>
          {toKapra.map((t) => <div key={t.part}>{t.text}</div>)}
        </Collapsible>
      )}

      {toCheck.length > 0 && (
        <Collapsible
          title={`Check in Fishbowl first (${toCheck.length})`}
          hint="Zero everywhere and none on order — may just not be counted. Left out of the total."
          open={showCheck}
          onToggle={() => setShowCheck((s) => !s)}
        >
          {toCheck.map((l) => (
            <div key={l.r.part}>
              {friendlyName(l.part?.description, l.r.part)} <span className="text-gray-500">— needs {fmt(l.buy)}{unitWord(l.part?.uom, l.buy) ? ` ${unitWord(l.part?.uom, l.buy)}` : ""}</span>
            </div>
          ))}
        </Collapsible>
      )}

      {openOrder && (
        <VendorOrderDrawer
          v={openOrder}
          open={openVendor !== null}
          onClose={() => setOpenVendor(null)}
          onBuy={onBuy}
          overridden={overridden}
          nameOf={nameOf}
          onTopUp={() => {
            const extra = topUpToRun(
              openOrder.items.map((i) => ({
                part: i.r.part,
                buy: i.buy,
                weight: i.r.needed,
                multiple: partSettings.get(i.r.part)?.multiple ?? null,
              })),
              openOrder.runMin as number,
            );
            for (const i of openOrder.items) {
              const add = extra.get(i.r.part);
              if (add) onBuy(i.r.part, i.buy + add);
            }
          }}
          onFishbowlPo={() => poFiles([openOrder])}
          onPrint={() => printPo(openOrder)}
          onCopy={() => copyOrder(openOrder)}
          copied={copied === openOrder.vendor}
          busy={poBusy}
          error={poError}
        />
      )}
    </div>
  );
}

/* ─── One vendor's order, in a drawer ───────────────────────────────────── */

function VendorOrderDrawer({
  v, open, onClose, onBuy, overridden, nameOf, onTopUp, onFishbowlPo, onPrint, onCopy, copied, busy, error,
}: {
  v: VendorOrder;
  open: boolean;
  onClose: () => void;
  onBuy: (part: string, qty: number) => void;
  overridden: (part: string) => boolean;
  nameOf: (part: string) => string;
  onTopUp: () => void;
  onFishbowlPo: () => void;
  onPrint: () => void;
  onCopy: () => void;
  copied: boolean;
  busy: boolean;
  error: string | null;
}) {
  const under = v.runMin !== null && v.units < v.runMin;
  const canPo = v.vendor !== NO_VENDOR;

  return (
    <SlideOver open={open} onClose={onClose}>
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-gray-200 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", URGENCY_STYLE[v.worst].pill)}>{URGENCY_STYLE[v.worst].label}</span>
            </div>
            <h2 className="mt-1.5 truncate text-xl font-semibold text-gray-900">{v.vendor}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 border-b border-gray-100">
          <Stat label="Order total" value={money(v.total)} />
          <Stat label="Items" value={String(v.items.length)} />
          <Stat label="Arrives in" value={`~${v.weeks} weeks`} hint={v.guessed ? "no lead time in Fishbowl — 8 weeks assumed" : undefined} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {under && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={16} className="shrink-0 text-amber-600" />
              <div className="flex-1 text-sm text-amber-900">
                <b>{fmt((v.runMin as number) - v.units)} units under</b> {v.vendor}&rsquo;s {fmt(v.runMin as number)} minimum run.
              </div>
              <button
                onClick={onTopUp}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                title="Spread the extra across these items in proportion to how much each needs"
              >
                Top up
              </button>
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_128px_88px] gap-x-4 border-b border-gray-100 pb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            <span>Ingredient</span>
            <span className="text-right">Quantity</span>
            <span className="text-right">Cost</span>
          </div>
          <div className="divide-y divide-gray-100">
            {v.items.map((i) => {
              const unit = unitWord(i.part?.uom, i.buy);
              const covers = i.r.usedBy.length;
              return (
                <div key={i.r.part} className="grid grid-cols-[minmax(0,1fr)_128px_88px] items-center gap-x-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={clsx("h-2 w-2 shrink-0 rounded-full", URGENCY_STYLE[i.urgency].dot)} title={URGENCY_STYLE[i.urgency].label} />
                      <span className="truncate text-sm font-medium text-gray-900" title={i.part?.description}>
                        {friendlyName(i.part?.description, i.r.part)}
                      </span>
                    </div>
                    <div
                      className={clsx("truncate pl-4 text-xs", covers > 1 ? "text-violet-700" : "text-gray-500")}
                      title={i.r.usedBy.map(nameOf).join("\n")}
                    >
                      {covers > 1 ? `Covers ${covers} products` : `For ${nameOf(i.r.usedBy[0] ?? "")}`}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <input
                      inputMode="numeric"
                      value={i.buy === 0 ? "" : String(i.buy)}
                      onChange={(e) => onBuy(i.r.part, Number(e.target.value.replace(/[^\d]/g, "")))}
                      className={clsx(
                        "h-9 w-[88px] rounded-lg border px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-gray-300",
                        overridden(i.r.part) ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white",
                      )}
                    />
                    <span className="w-8 text-xs text-gray-500">{unit}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm tabular-nums text-gray-900">{i.lineCost !== null ? money(i.lineCost) : "—"}</div>
                    <div className="text-[11px] text-gray-400" title={i.priceDate ? `From the PO of ${i.priceDate.slice(0, 10)}` : undefined}>
                      {i.cost !== null ? `$${i.cost.toFixed(i.cost < 1 ? 3 : 2)} ea` : "no price"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 px-6 py-4">
          {canPo ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={onFishbowlPo}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                title="Import in Fishbowl: File → Import → Purchase Order. Arrives as a draft to check and issue."
              >
                <FileDown size={16} /> Fishbowl PO
              </button>
              <button
                onClick={onPrint}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Printer size={16} /> Print PO
              </button>
              <button
                onClick={onCopy}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              These parts have no vendor in Fishbowl, so no PO can be made. Set a default vendor on them in Fishbowl, then refresh.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
    </SlideOver>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-6 py-3" title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-gray-900">
        {value}
        {hint && <span className="text-gray-400">?</span>}
      </div>
    </div>
  );
}

function Collapsible({
  title, hint, open, onToggle, icon, children,
}: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50">
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown size={14} className={clsx("text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-gray-100 px-4 py-3 text-sm text-gray-700">
          {hint && <div className="text-xs text-gray-500">{hint}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

