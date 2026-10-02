"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Search,
  Plus,
  Archive,
  PackageCheck,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import clsx from "clsx";

import { useBrand } from "@/components/BrandContext";
import { Product } from "@/components/inventory/types";
import { type Trend, TREND_CONFIG, computeTrend } from "@/lib/trends";
import { useBrandSettings, brandBadgeStyle } from "@/lib/brand-settings";
import CreateProductModal from "./CreateProductModal";
import type { Brand } from "@/types/brand";

/* ─── Sales lookup type ─── */

type SalesLookup = Record<
  string,
  { recent90: number; prior90: number; hasSalesInLast180: boolean; hasSalesBefore180: boolean }
>;

/* ─── Filter types ─── */

type StatusFilter = "current" | "archived" | "all";
type TrendFilter = "all" | Trend;

/* Trends offered in the multiselect, ordered by TREND_CONFIG.rank. */
const TREND_OPTIONS: Trend[] = ["growing", "new", "stable", "declining"];

/* ─── Sort types ─── */

type SortKey = "part" | "display_name" | "brand" | "fragrance" | "size" | "product_type" | "trend" | "forecast" | "media";
type SortDir = "asc" | "desc";

/* Media kit completeness: which parts have copy + which photo types */
type MediaStatus = { hasCopy: boolean; assetTypes: Set<string> };
type MediaLookup = Record<string, MediaStatus>;

/* Every piece of media a product should have. "copy" is the text; the rest
   are media_kit_assets.asset_type values. Order = order in the dropdown. */
type MediaKind =
  | "copy"
  | "front"
  | "benefits"
  | "lifestyle"
  | "ingredients"
  | "fragrance"
  | "other";

const MEDIA_KINDS: { kind: MediaKind; label: string }[] = [
  { kind: "copy", label: "Copy" },
  { kind: "front", label: "Front" },
  { kind: "benefits", label: "Benefits" },
  { kind: "lifestyle", label: "Lifestyle" },
  { kind: "ingredients", label: "Ingredients / Back" },
  { kind: "fragrance", label: "Fragrance" },
  { kind: "other", label: "Other" },
];

const ALL_MEDIA_KINDS = MEDIA_KINDS.map((m) => m.kind);

function isMissing(status: MediaStatus | undefined, kind: MediaKind): boolean {
  if (!status) return true;
  return kind === "copy" ? !status.hasCopy : !status.assetTypes.has(kind);
}

/** True if the product is missing ANY of the given media kinds. */
function missingAny(status: MediaStatus | undefined, kinds: Iterable<MediaKind>): boolean {
  for (const k of kinds) if (isMissing(status, k)) return true;
  return false;
}

/* ─── Filter persistence ───────────────────────────────────────────────
   Filters + sort live in the URL query string so opening a product and
   hitting Back lands on the same filtered table; sessionStorage covers
   links that go to a bare /products. */

const FILTERS_STORAGE_KEY = "products:list-filters";

const SORT_KEYS: SortKey[] = ["part", "display_name", "brand", "fragrance", "size", "product_type", "trend", "forecast", "media"];

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): Set<T> {
  if (!raw) return new Set();
  return new Set(raw.split(",").filter((v): v is T => (allowed as readonly string[]).includes(v)));
}

/* ─── Page ─── */

export default function ProductListPage() {
  const router = useRouter();
  const { brand } = useBrand();
  const { byBrand } = useBrandSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("current");
  // Multiselect: empty set == all trends (keeps "cleared" and "everything" as one state).
  const [trendSel, setTrendSel] = useState<Set<Trend>>(new Set());
  // Media kinds the product must be missing (any of). Empty == filter off.
  const [mediaSel, setMediaSel] = useState<Set<MediaKind>>(new Set());

  const [sortKey, setSortKey] = useState<SortKey>("part");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /* Restore filters from the URL once on mount, then mirror every change
     back into it (replaceState — no history entry per keystroke). */
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    // A bare /products (detail page's Back link, sidebar) falls back to the
    // last filters used this tab.
    let qs = window.location.search;
    if (!qs) {
      try {
        qs = sessionStorage.getItem(FILTERS_STORAGE_KEY) ?? "";
      } catch {}
    }
    const sp = new URLSearchParams(qs);
    setQuery(sp.get("q") ?? "");
    const st = sp.get("status");
    if (st === "current" || st === "archived" || st === "all") setStatus(st);
    setTrendSel(parseList(sp.get("trend"), TREND_OPTIONS));
    setMediaSel(parseList(sp.get("media"), ALL_MEDIA_KINDS));
    const sk = sp.get("sort") as SortKey | null;
    if (sk && SORT_KEYS.includes(sk)) setSortKey(sk);
    if (sp.get("dir") === "desc") setSortDir("desc");
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (status !== "current") sp.set("status", status);
    if (trendSel.size) sp.set("trend", [...trendSel].join(","));
    if (mediaSel.size) sp.set("media", [...mediaSel].join(","));
    if (sortKey !== "part") sp.set("sort", sortKey);
    if (sortDir !== "asc") sp.set("dir", sortDir);
    const qs = sp.toString();
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, qs ? `?${qs}` : "");
    } catch {}
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [urlReady, query, status, trendSel, mediaSel, sortKey, sortDir]);

  /* Sales data for trend calculation */
  const [salesLookup, setSalesLookup] = useState<SalesLookup>({});

  /* Media kit completeness */
  const [mediaLookup, setMediaLookup] = useState<MediaLookup>({});

  /* ─── Data fetching ─── */

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("inventory_products")
      .select("*")
      .order("display_name");
    setProducts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  /* Load sales data for trend calculation (90-day windows) */
  useEffect(() => {
    async function loadTrends() {
      const now = new Date();

      // We need data going back far enough to determine "new" products
      // Fetch ~12 months to check for sales before the 180-day window
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
      const fromDate = twelveMonthsAgo.toISOString().slice(0, 10);

      // Date boundaries for 90-day windows
      const d90ago = new Date(now);
      d90ago.setDate(d90ago.getDate() - 90);
      const d180ago = new Date(now);
      d180ago.setDate(d180ago.getDate() - 180);

      const cutoff90 = d90ago.toISOString().slice(0, 10);
      const cutoff180 = d180ago.toISOString().slice(0, 10);

      const { data } = await supabase
        .from("sales_by_product_month_enriched")
        .select("productnum, month, units_fulfilled")
        .gte("month", fromDate)
        .order("month", { ascending: true });

      if (!data) return;

      const lookup: SalesLookup = {};
      data.forEach((r) => {
        const key = r.productnum;
        if (!lookup[key])
          lookup[key] = { recent90: 0, prior90: 0, hasSalesInLast180: false, hasSalesBefore180: false };

        const units = r.units_fulfilled ?? 0;
        const month = r.month; // "YYYY-MM-DD"

        if (month >= cutoff90) {
          lookup[key].recent90 += units;
          lookup[key].hasSalesInLast180 = true;
        } else if (month >= cutoff180) {
          lookup[key].prior90 += units;
          lookup[key].hasSalesInLast180 = true;
        } else {
          // Before the 180-day window
          if (units > 0) lookup[key].hasSalesBefore180 = true;
        }
      });

      setSalesLookup(lookup);
    }
    loadTrends();
  }, []);

  /* Load media kit completeness */
  useEffect(() => {
    async function loadMedia() {
      const [copyRes, assetsRes] = await Promise.all([
        supabase
          .from("media_kit_products")
          .select("part, short_description, long_description, benefits"),
        supabase
          .from("media_kit_assets")
          .select("part, asset_type"),
      ]);

      const lookup: MediaLookup = {};

      (copyRes.data ?? []).forEach((r: { part: string; short_description: string | null; long_description: string | null; benefits: string | null }) => {
        const hasCopy = !!(r.short_description || r.long_description || r.benefits);
        if (!lookup[r.part]) lookup[r.part] = { hasCopy: false, assetTypes: new Set() };
        lookup[r.part].hasCopy = hasCopy;
      });

      (assetsRes.data ?? []).forEach((r: { part: string; asset_type: string }) => {
        if (!lookup[r.part]) lookup[r.part] = { hasCopy: false, assetTypes: new Set() };
        lookup[r.part].assetTypes.add(r.asset_type);
      });

      setMediaLookup(lookup);
    }
    loadMedia();
  }, []);

  /* ─── Toggle forecast ─── */

  async function toggleForecast(part: string, value: boolean) {
    // Archiving also drops the product to Draft so it leaves the storefronts.
    // (A DB trigger enforces the same rule for every other write path.)
    const patch: Partial<Product> = value
      ? { is_forecasted: true }
      : { is_forecasted: false, storefront_channel: "off" };
    setProducts((prev) =>
      prev.map((p) => (p.part === part ? { ...p, ...patch } : p))
    );
    await supabase
      .from("inventory_products")
      .update(patch)
      .eq("part", part);
  }

  /* ─── Trend per product ─── */

  function getTrend(part: string): Trend {
    const s = salesLookup[part];
    if (!s) return "unknown";
    return computeTrend(s.recent90, s.prior90, s.hasSalesInLast180, s.hasSalesBefore180);
  }

  /* ─── Sort handler ─── */

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  /* ─── Brand-scoped product list (basis for pill counts) ─── */

  const brandScoped = useMemo(
    () => products.filter((p) => brand === "all" || p.brand === brand),
    [products, brand],
  );

  /* ─── Cross-filter helper ─────────────────────────────────────────────
     Each pill count needs to reflect the rows that *would* show if you
     clicked it — that means applying every other active filter except the
     one you're computing the count for. `passesFilters(p, except)` returns
     true if a product matches all filters minus the named dimension. */

  const passesFilters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      p: Product,
      except: "status" | "trend" | "needsMedia" | null,
    ): boolean => {
      // Search always applies (it's not one of the pill dimensions).
      if (q) {
        const matches =
          p.part.toLowerCase().includes(q) ||
          p.display_name?.toLowerCase().includes(q) ||
          p.fragrance?.toLowerCase().includes(q) ||
          p.part_type?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (except !== "status") {
        if (status === "current" && !p.is_forecasted) return false;
        if (status === "archived" && p.is_forecasted) return false;
      }
      if (except !== "trend" && trendSel.size > 0) {
        if (!trendSel.has(getTrend(p.part))) return false;
      }
      if (except !== "needsMedia" && mediaSel.size > 0) {
        if (!missingAny(mediaLookup[p.part], mediaSel)) return false;
      }
      return true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, trendSel, mediaSel, salesLookup, mediaLookup]);

  /* ─── Pill counts (cross-filtered) ───────────────────────────────────
     Each pill's count = how many rows would show if you clicked it,
     respecting every other active filter. */

  const counts = useMemo(() => {
    // Status pills: hold trend/needsMedia/search constant, vary status.
    const statusPool = brandScoped.filter((p) =>
      passesFilters(p, "status"),
    );
    const current = statusPool.filter((p) => p.is_forecasted).length;
    const archived = statusPool.length - current;

    // Trend pills: hold status/needsMedia/search constant, vary trend.
    const trendPool = brandScoped.filter((p) => passesFilters(p, "trend"));
    const trend: Record<TrendFilter, number> = {
      all: trendPool.length,
      growing: 0,
      declining: 0,
      stable: 0,
      new: 0,
      unknown: 0,
    };
    for (const p of trendPool) {
      const t = getTrend(p.part);
      if (t in trend) trend[t as TrendFilter]++;
    }

    // Needs media: hold status/trend/search constant, count per missing kind.
    const mediaPool = brandScoped.filter((p) => passesFilters(p, "needsMedia"));
    const media = { any: 0 } as Record<MediaKind | "any", number>;
    for (const { kind } of MEDIA_KINDS) media[kind] = 0;
    for (const p of mediaPool) {
      const s = mediaLookup[p.part];
      let any = false;
      for (const { kind } of MEDIA_KINDS) {
        if (isMissing(s, kind)) {
          media[kind]++;
          any = true;
        }
      }
      if (any) media.any++;
    }

    return {
      current,
      archived,
      all: statusPool.length,
      trend,
      media,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandScoped, passesFilters, mediaLookup, salesLookup]);

  /* ─── Filtering & Sorting ─── */

  const filtered = useMemo(() => {
    let result = brandScoped.filter((p) => passesFilters(p, null));

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "part":
          cmp = a.part.localeCompare(b.part);
          break;
        case "display_name":
          cmp = (a.display_name ?? "").localeCompare(b.display_name ?? "");
          break;
        case "brand":
          cmp = a.brand.localeCompare(b.brand);
          break;
        case "fragrance":
          cmp = (a.fragrance ?? "").localeCompare(b.fragrance ?? "");
          break;
        case "size":
          cmp = (a.size ?? "").localeCompare(b.size ?? "");
          break;
        case "product_type":
          cmp = (a.product_type ?? "").localeCompare(b.product_type ?? "");
          break;
        case "trend": {
          const tA = TREND_CONFIG[getTrend(a.part)].rank;
          const tB = TREND_CONFIG[getTrend(b.part)].rank;
          cmp = tA - tB;
          break;
        }
        case "forecast":
          cmp = (a.is_forecasted ? 0 : 1) - (b.is_forecasted ? 0 : 1);
          break;
        case "media": {
          const scoreA = ALL_MEDIA_KINDS.filter((k) => !isMissing(mediaLookup[a.part], k)).length;
          const scoreB = ALL_MEDIA_KINDS.filter((k) => !isMissing(mediaLookup[b.part], k)).length;
          cmp = scoreA - scoreB;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandScoped, query, status, trendSel, mediaSel, salesLookup, sortKey, sortDir, mediaLookup]);

  /* ─── Column definitions ─── */

  const COLUMNS: { key: SortKey; label: string; align?: "center" }[] = [
    { key: "part", label: "SKU" },
    { key: "display_name", label: "Name" },
    { key: "brand", label: "Brand" },
    { key: "fragrance", label: "Fragrance" },
    { key: "size", label: "Size" },
    { key: "product_type", label: "Type" },
    { key: "trend", label: "Trend", align: "center" },
    { key: "media", label: "Media", align: "center" },
    { key: "forecast", label: "Forecast", align: "center" },
  ];

  /* Default brand for the create modal: respects the active brand filter, falls
     back to NI when "all". */
  const defaultBrandForCreate: Brand = brand === "all" ? "NI" : brand;

  /* ─── Render ─── */

  return (
    <div className="px-4 md:px-8 py-4 md:py-5 space-y-3">
      {/* Single-row toolbar — filters + new product on one line */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[240px] max-w-[460px] flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, name, fragrance…"
            className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        {/* Status dropdown */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
          title="Filter by product status"
        >
          <option value="current">Current ({counts.current})</option>
          <option value="archived">Archived ({counts.archived})</option>
          <option value="all">All ({counts.all})</option>
        </select>

        {/* Trend multiselect */}
        <TrendMultiSelect
          selected={trendSel}
          counts={counts.trend}
          totalCount={counts.trend.all}
          onChange={setTrendSel}
        />

        {/* Needs media multiselect — missing any of the checked kinds */}
        <NeedsMediaMultiSelect
          selected={mediaSel}
          counts={counts.media}
          onChange={setMediaSel}
        />

        {/* Add product (pushed right) */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-800 transition"
          >
            <Plus size={14} />
            New product
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={clsx(
                    "px-2 py-2 font-medium select-none cursor-pointer hover:text-gray-600 transition-colors group",
                    col.align === "center" ? "text-center" : "text-left"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon
                      active={sortKey === col.key}
                      dir={sortKey === col.key ? sortDir : undefined}
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((p, idx) => {
              const trend = getTrend(p.part);
              const cfg = TREND_CONFIG[trend];
              const TrendIcon = cfg.icon;
              const brandStyle = brandBadgeStyle(
                byBrand[p.brand]?.primary_color,
              );
              const brandLabel =
                byBrand[p.brand]?.display_name?.trim() || p.brand;

              return (
                <tr
                  key={p.part}
                  className={clsx(
                    "transition-colors hover:bg-gray-50 cursor-pointer",
                    idx !== filtered.length - 1 && "border-b border-gray-50"
                  )}
                  onClick={() =>
                    router.push(
                      `/products/${encodeURIComponent(p.part)}`
                    )
                  }
                >
                  <td className="px-2 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">
                    {p.part}
                  </td>
                  <td className="px-2 py-2 font-medium text-gray-900 max-w-[220px] truncate">
                    {p.display_name}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      style={brandStyle}
                      title={brandLabel}
                    >
                      {p.brand}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                    {p.fragrance || "—"}
                  </td>
                  <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                    {p.size || "—"}
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {p.product_type}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {trend !== "unknown" ? (
                      <span
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
                          cfg.bg,
                          cfg.color
                        )}
                      >
                        <TrendIcon size={12} />
                        {cfg.label}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <MediaBadge status={mediaLookup[p.part]} />
                  </td>
                  <td
                    className="px-2 py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        toggleForecast(p.part, !p.is_forecasted)
                      }
                      className={clsx(
                        "inline-flex items-center justify-center rounded-md p-1 transition",
                        p.is_forecasted
                          ? "text-green-600 hover:bg-green-50"
                          : "text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                      )}
                      title={
                        p.is_forecasted
                          ? "Remove from forecast"
                          : "Add to forecast"
                      }
                    >
                      {p.is_forecasted ? (
                        <PackageCheck size={16} />
                      ) : (
                        <Archive size={16} />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-gray-100 p-3 mb-3">
              <Search size={18} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">
              No products found
            </p>
            <p className="mt-1 text-sm text-gray-500 max-w-sm">
              {query || trendSel.size > 0 || mediaSel.size > 0
                ? "Try adjusting your search or filters."
                : "Add your first product to get started."}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className="text-xs text-gray-400">
          Showing {filtered.length} of {counts.all} products
        </div>
      )}

      <CreateProductModal
        open={createOpen}
        defaultBrand={defaultBrandForCreate}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />
    </div>
  );
}

/* ─── Trend multiselect dropdown ───────────────────────────────────────
   Empty selection == all trends. Counts reflect every other active filter
   (search/status/needs-media), matching the cross-filtered pill behavior. */

function TrendMultiSelect({
  selected,
  counts,
  totalCount,
  onChange,
}: {
  selected: Set<Trend>;
  counts: Record<TrendFilter, number>;
  totalCount: number;
  onChange: (next: Set<Trend>) => void;
}) {
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

  function toggle(t: Trend) {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange(next);
  }

  const label =
    selected.size === 0
      ? "All trends"
      : selected.size === 1
        ? TREND_CONFIG[[...selected][0]].label
        : `${selected.size} trends`;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={clsx(
          "inline-flex min-w-[130px] items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium transition",
          selected.size > 0
            ? "border-gray-900 text-gray-900"
            : "border-gray-200 text-gray-600",
        )}
        title="Filter by trend"
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={12}
          className={clsx(
            "ml-auto shrink-0 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
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
              All trends
            </span>
            <span className="text-xs tabular-nums text-gray-400">{totalCount}</span>
          </button>

          <div className="border-t border-gray-100">
            {TREND_OPTIONS.map((t) => {
              const cfg = TREND_CONFIG[t];
              const TrendIcon = cfg.icon;
              const on = selected.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {on && <Check size={14} className="text-gray-900" />}
                  </span>
                  <TrendIcon size={13} className={clsx("shrink-0", cfg.color)} />
                  <span
                    className={clsx(
                      "flex-1",
                      on ? "font-medium text-gray-900" : "text-gray-600",
                    )}
                  >
                    {cfg.label}
                  </span>
                  <span className="text-xs tabular-nums text-gray-400">
                    {counts[t]}
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

/* ─── Needs-media multiselect ─────────────────────────────────────────
   Empty selection == filter off. "Missing anything" checks every kind.
   A product shows if it's missing ANY checked kind. */

function NeedsMediaMultiSelect({
  selected,
  counts,
  onChange,
}: {
  selected: Set<MediaKind>;
  counts: Record<MediaKind | "any", number>;
  onChange: (next: Set<MediaKind>) => void;
}) {
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

  function toggle(k: MediaKind) {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(next);
  }

  const allOn = selected.size === MEDIA_KINDS.length;
  const active = selected.size > 0;
  const label = !active
    ? "Needs media"
    : allOn
      ? "Missing anything"
      : selected.size === 1
        ? `Missing ${MEDIA_KINDS.find((m) => selected.has(m.kind))!.label}`
        : `Missing ${selected.size} types`;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={clsx(
          "inline-flex min-w-[130px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
          active
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300",
        )}
        title="Show products missing specific media"
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={12}
          className={clsx(
            "ml-auto shrink-0 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => onChange(allOn ? new Set() : new Set(ALL_MEDIA_KINDS))}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {allOn && <Check size={14} className="text-gray-900" />}
            </span>
            <span className={clsx("flex-1", allOn ? "font-medium text-gray-900" : "text-gray-600")}>
              Missing anything
            </span>
            <span className="text-xs tabular-nums text-gray-400">{counts.any}</span>
          </button>

          <div className="border-t border-gray-100">
            {MEDIA_KINDS.map(({ kind, label: kLabel }) => {
              const on = selected.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggle(kind)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {on && <Check size={14} className="text-gray-900" />}
                  </span>
                  <span className={clsx("flex-1", on ? "font-medium text-gray-900" : "text-gray-600")}>
                    {kLabel}
                  </span>
                  <span className="text-xs tabular-nums text-gray-400">{counts[kind]}</span>
                </button>
              );
            })}
          </div>

          {active && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="w-full border-t border-gray-100 px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sort icon ─── */

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir?: SortDir;
}) {
  if (!active) {
    return (
      <ChevronsUpDown
        size={12}
        className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
      />
    );
  }
  return dir === "asc" ? (
    <ChevronUp size={12} className="text-gray-600" />
  ) : (
    <ChevronDown size={12} className="text-gray-600" />
  );
}

/* ─── Media badge ─── */

function MediaBadge({ status }: { status?: MediaStatus }) {
  if (!status || (!status.hasCopy && status.assetTypes.size === 0)) {
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
        Missing
      </span>
    );
  }

  const missing: string[] = [];
  if (!status.hasCopy) missing.push("Copy");
  const missingPhotos = MEDIA_KINDS.filter(
    (m) => m.kind !== "copy" && isMissing(status, m.kind),
  );
  if (missingPhotos.length) missing.push("Photos");

  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-600">
        Complete
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600"
      title={missingPhotos.length ? `Missing photos: ${missingPhotos.map((m) => m.label).join(", ")}` : undefined}
    >
      {missing.join(" + ")}
    </span>
  );
}
