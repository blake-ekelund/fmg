"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Search,
  Plus,
  Archive,
  PackageCheck,
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
import CopyImportExport from "./CopyImportExport";
import type { Brand } from "@/types/brand";

/* ─── Sales lookup type ─── */

type SalesLookup = Record<
  string,
  { recent90: number; prior90: number; hasSalesInLast180: boolean; hasSalesBefore180: boolean }
>;

/* ─── Filter types ─── */

type StatusFilter = "current" | "archived" | "all";
type TrendFilter = "all" | Trend;

/* ─── Sort types ─── */

type SortKey = "part" | "display_name" | "brand" | "fragrance" | "size" | "product_type" | "trend" | "forecast" | "media";
type SortDir = "asc" | "desc";

/* Media kit completeness: which parts have copy + assets */
type MediaStatus = { hasCopy: boolean; assetCount: number };
type MediaLookup = Record<string, MediaStatus>;

const REQUIRED_ASSETS = 6; // front, benefits, lifestyle, ingredients, fragrance, other

/** A product needs media if it lacks copy OR has fewer than REQUIRED_ASSETS photos. */
function needsMedia(status: MediaStatus | undefined): boolean {
  if (!status) return true;
  return !status.hasCopy || status.assetCount < REQUIRED_ASSETS;
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
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");
  const [needsMediaOnly, setNeedsMediaOnly] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("part");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
        if (!lookup[r.part]) lookup[r.part] = { hasCopy: false, assetCount: 0 };
        lookup[r.part].hasCopy = hasCopy;
      });

      (assetsRes.data ?? []).forEach((r: { part: string; asset_type: string }) => {
        if (!lookup[r.part]) lookup[r.part] = { hasCopy: false, assetCount: 0 };
        lookup[r.part].assetCount++;
      });

      setMediaLookup(lookup);
    }
    loadMedia();
  }, []);

  /* ─── Toggle forecast ─── */

  async function toggleForecast(part: string, value: boolean) {
    setProducts((prev) =>
      prev.map((p) =>
        p.part === part ? { ...p, is_forecasted: value } : p
      )
    );
    await supabase
      .from("inventory_products")
      .update({ is_forecasted: value })
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
      if (except !== "trend" && trendFilter !== "all") {
        if (getTrend(p.part) !== trendFilter) return false;
      }
      if (except !== "needsMedia" && needsMediaOnly) {
        if (!needsMedia(mediaLookup[p.part])) return false;
      }
      return true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, trendFilter, needsMediaOnly, salesLookup, mediaLookup]);

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

    // Needs media: hold status/trend/search constant, count missing-media.
    const needsMediaCount = brandScoped
      .filter((p) => passesFilters(p, "needsMedia"))
      .filter((p) => needsMedia(mediaLookup[p.part])).length;

    return {
      current,
      archived,
      all: statusPool.length,
      trend,
      needsMedia: needsMediaCount,
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
          const mA = mediaLookup[a.part];
          const mB = mediaLookup[b.part];
          const scoreA = (mA?.hasCopy ? 1 : 0) + (mA?.assetCount ?? 0);
          const scoreB = (mB?.hasCopy ? 1 : 0) + (mB?.assetCount ?? 0);
          cmp = scoreA - scoreB;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandScoped, query, status, trendFilter, needsMediaOnly, salesLookup, sortKey, sortDir, mediaLookup]);

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
      {/* Single-row toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
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

        {/* Status segmented control */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          <PillButton
            label={`Current (${counts.current})`}
            active={status === "current"}
            onClick={() => setStatus("current")}
          />
          <PillButton
            label={`Archived (${counts.archived})`}
            active={status === "archived"}
            onClick={() => setStatus("archived")}
          />
          <PillButton
            label={`All (${counts.all})`}
            active={status === "all"}
            onClick={() => setStatus("all")}
          />
        </div>

        {/* Trend filter */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          <PillButton
            label="All trends"
            active={trendFilter === "all"}
            onClick={() => setTrendFilter("all")}
          />
          <PillButton
            label={`Growing (${counts.trend.growing})`}
            active={trendFilter === "growing"}
            onClick={() => setTrendFilter("growing")}
          />
          <PillButton
            label={`Declining (${counts.trend.declining})`}
            active={trendFilter === "declining"}
            onClick={() => setTrendFilter("declining")}
          />
          <PillButton
            label={`Stable (${counts.trend.stable})`}
            active={trendFilter === "stable"}
            onClick={() => setTrendFilter("stable")}
          />
          <PillButton
            label={`New (${counts.trend.new})`}
            active={trendFilter === "new"}
            onClick={() => setTrendFilter("new")}
          />
        </div>

        {/* Needs media toggle */}
        <button
          onClick={() => setNeedsMediaOnly((v) => !v)}
          className={clsx(
            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
            needsMediaOnly
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300",
          )}
          title={
            needsMediaOnly
              ? "Showing only products missing media — click to clear"
              : "Show only products missing copy or photos"
          }
        >
          Needs media ({counts.needsMedia})
        </button>

        {/* Copy export/import + add product (pushed right) */}
        <div className="ml-auto flex items-center gap-2">
          <CopyImportExport onImported={load} />
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
              {query || trendFilter !== "all" || needsMediaOnly
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

/* ─── Pill button (used across toolbar segments) ─── */

function PillButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-md px-2.5 py-1 text-xs font-medium transition",
        active
          ? "bg-gray-900 text-white"
          : "text-gray-600 hover:text-gray-900",
      )}
    >
      {label}
    </button>
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
  if (!status || (!status.hasCopy && status.assetCount === 0)) {
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
        Missing
      </span>
    );
  }

  const missing: string[] = [];
  if (!status.hasCopy) missing.push("Copy");
  if (status.assetCount < REQUIRED_ASSETS) missing.push("Photos");

  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-600">
        Complete
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
      {missing.join(" + ")}
    </span>
  );
}
