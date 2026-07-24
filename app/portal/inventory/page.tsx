"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "@/components/portal/icons";
import Pagination from "@/components/portal/Pagination";
import MultiSelect from "@/components/portal/MultiSelect";
import { portalGet, usd, shortDate, type PortalInventory, type PortalInventoryItem } from "@/components/portal/api";

/**
 * Availability — company-wide stock status, ordered by the rep's own best
 * sellers. A status band (In stock / Low / Out) plus what's on the way (never
 * exact counts), the rep's trailing-12-month units, and a month-by-month trend
 * so "what I sell" and "what's in stock" line up on one screen.
 */

const STATUS: Record<PortalInventoryItem["status"], { label: string; tone: string; dot: string }> = {
  in: { label: "In stock", tone: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  low: { label: "Low", tone: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  out: { label: "Out", tone: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
};

const BRAND_LABEL: Record<string, string> = { NI: "Natural Inspirations", Sassy: "Sassy" };

type StatusFilter = "all" | PortalInventoryItem["status"];

/** Slug/lowercase → Title Case ("eucalyptus-rosemary-mint" → "Eucalyptus Rosemary Mint"). */
function prettify(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The "collection" a rep filters on differs by brand: Sassy groups by its
 * collection (everyday / love / holiday), Natural Inspirations by fragrance.
 */
function effCollection(i: PortalInventoryItem): string | null {
  const v = i.brand === "Sassy" ? i.collection : i.fragrance;
  return v || null;
}

/**
 * The rep's monthly units over the last 12 months, oldest→newest, with a month
 * axis and the peak month emphasized. Hover a bar for the full month + units.
 */
function TrendChart({ monthly, labels }: { monthly: number[]; labels: string[] }) {
  const max = Math.max(1, ...monthly);
  const hasSales = monthly.some((v) => v > 0);
  const peak = hasSales ? monthly.indexOf(Math.max(...monthly)) : -1;
  return (
    <div className="w-[140px]">
      <div className="flex h-8 items-end gap-[3px]">
        {monthly.map((v, i) => (
          <div
            key={i}
            title={`${labels[i] ?? ""}: ${v.toLocaleString()} units`}
            className={`flex-1 rounded-sm ${i === peak ? "bg-brand-600" : "bg-brand-200"}`}
            style={{ height: `${Math.max((v / max) * 100, v > 0 ? 10 : 4)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {labels.map((m, i) => (
          <div
            key={i}
            className={`flex-1 text-center text-[8px] uppercase leading-none ${
              i === peak ? "font-semibold text-gray-600" : "text-gray-300"
            }`}
          >
            {m.charAt(0)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortalInventoryPage() {
  const [data, setData] = useState<PortalInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [collectionSel, setCollectionSel] = useState<Set<string>>(() => new Set());
  const [titleSel, setTitleSel] = useState<Set<string>>(() => new Set());
  const [formSel, setFormSel] = useState<Set<string>>(() => new Set());
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  useEffect(() => {
    portalGet<PortalInventory>("/api/portal/inventory")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const brands = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.items.map((i) => i.brand).filter(Boolean));
    return ["NI", "Sassy"].filter((b) => set.has(b));
  }, [data]);

  const counts = useMemo(() => {
    const c = { all: 0, in: 0, low: 0, out: 0 } as Record<StatusFilter, number>;
    if (!data) return c;
    for (const i of data.items) {
      if (brand !== "all" && i.brand !== brand) continue;
      c.all++;
      c[i.status]++;
    }
    return c;
  }, [data, brand]);

  /* Options for the multi-selects, drawn from the products actually present
     (respecting the brand chip so a Sassy-only view doesn't offer NI-only
     collections). Sorted, de-duped. */
  const options = useMemo(() => {
    const cols = new Set<string>();
    const titles = new Set<string>();
    const forms = new Set<string>();
    for (const i of data?.items ?? []) {
      if (brand !== "all" && i.brand !== brand) continue;
      const ec = effCollection(i);
      if (ec) cols.add(ec);
      if (i.productTitle) titles.add(i.productTitle);
      if (i.form) forms.add(i.form);
    }
    const opts = (s: Set<string>, pretty = false) =>
      [...s]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: pretty ? prettify(v) : v }));
    return { collections: opts(cols, true), titles: opts(titles), forms: opts(forms) };
  }, [data, brand]);

  // Sassy filters by collection, NI by fragrance — name the control to match.
  const collectionLabel =
    brand === "NI" ? "Fragrance" : brand === "Sassy" ? "Collection" : "Collection / Fragrance";

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.items.filter((i) => {
      if (brand !== "all" && i.brand !== brand) return false;
      if (status !== "all" && i.status !== status) return false;
      if (collectionSel.size) {
        const ec = effCollection(i);
        if (!(ec && collectionSel.has(ec))) return false;
      }
      if (titleSel.size && !(i.productTitle && titleSel.has(i.productTitle))) return false;
      if (formSel.size && !(i.form && formSel.has(i.form))) return false;
      if (
        q &&
        !i.name.toLowerCase().includes(q) &&
        !(i.fragrance ?? "").toLowerCase().includes(q) &&
        !i.part.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [data, search, brand, status, collectionSel, titleSel, formSel]);

  // Back to page 1 whenever the filter set changes — reset during render (per
  // React guidance) rather than in an effect, so there's no cascading render.
  const filterKey = `${search}|${brand}|${status}|${[...collectionSel].sort().join(",")}|${[...titleSel].sort().join(",")}|${[...formSel].sort().join(",")}|${pageSize}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (filterKey !== lastKey) {
    setLastKey(filterKey);
    setPage(0);
  }
  const paged = useMemo(
    () => filtered.slice(page * pageSize, page * pageSize + pageSize),
    [filtered, page, pageSize],
  );

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Availability
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Your best sellers first, with live stock status.
            {data?.asOf ? ` Stock as of ${shortDate(data.asOf)}.` : ""}
          </p>
        </div>
        {brands.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {[{ v: "all", label: "All brands" }, ...brands.map((b) => ({ v: b, label: BRAND_LABEL[b] ?? b }))].map(
              (f) => {
                const active = brand === f.v;
                return (
                  <button
                    key={f.v}
                    onClick={() => setBrand(f.v)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              },
            )}
          </div>
        )}
      </div>

      {/* Status filter + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {([
            { v: "all", label: "All" },
            { v: "in", label: "In stock" },
            { v: "low", label: "Low" },
            { v: "out", label: "Out" },
          ] as { v: StatusFilter; label: string }[]).map((f) => {
            const active = status === f.v;
            return (
              <button
                key={f.v}
                onClick={() => setStatus(f.v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${
                    active ? "bg-white/20" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {counts[f.v]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product, scent, or part…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Attribute filters — multi-select */}
      {data && (options.collections.length > 0 || options.titles.length > 0 || options.forms.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {options.collections.length > 0 && (
            <MultiSelect
              label={collectionLabel}
              options={options.collections}
              selected={collectionSel}
              onChange={setCollectionSel}
            />
          )}
          {options.titles.length > 0 && (
            <MultiSelect
              label="Product"
              options={options.titles}
              selected={titleSel}
              onChange={setTitleSel}
            />
          )}
          {options.forms.length > 0 && (
            <MultiSelect
              label="Form"
              options={options.forms}
              selected={formSel}
              onChange={setFormSel}
            />
          )}
          {(collectionSel.size > 0 || titleSel.size > 0 || formSel.size > 0) && (
            <button
              onClick={() => {
                setCollectionSel(new Set());
                setTitleSel(new Set());
                setFormSel(new Set());
              }}
              className="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center text-sm text-gray-400">
          No products match.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Product</th>
                  <th className="hidden px-4 py-3 md:table-cell">Trend · last 12 mo</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">$ sold · last 12 mo</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">Units · last 12 mo</th>
                  <th className="px-4 py-3 text-right">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paged.map((i) => {
                  const s = STATUS[i.status];
                  const sold = i.units12mo > 0;
                  return (
                    <tr key={i.part}>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">{i.name}</div>
                            <div className="truncate text-xs text-gray-400">
                              {[BRAND_LABEL[i.brand] ?? i.brand, i.fragrance, i.form]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            {i.seasonNote && (
                              <div className="truncate text-[11px] text-gray-400">
                                {i.seasonNote}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 align-middle md:table-cell">
                        <TrendChart monthly={i.monthly} labels={data.monthLabels} />
                      </td>
                      <td className="hidden px-4 py-3 text-right align-middle tabular-nums text-gray-900 sm:table-cell">
                        {sold ? usd(i.revenue12mo) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="hidden px-4 py-3 text-right align-middle tabular-nums text-gray-600 sm:table-cell">
                        {sold ? i.units12mo.toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>
                            {s.label}
                          </span>
                          {i.status !== "in" && i.onOrder > 0 && (
                            <span className="text-[11px] text-gray-400">
                              {i.onOrder.toLocaleString()} on the way
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </>
      )}

      <p className="text-center text-xs text-gray-400">
        Ordered by your last-12-months volume. Status reflects units available to
        sell — confirm large orders with the office.
      </p>
    </div>
  );
}
