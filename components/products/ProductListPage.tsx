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

import PageHeader from "@/components/ui/PageHeader";
import { useBrand } from "@/components/BrandContext";
import { Product } from "@/components/inventory/types";
import { type Trend, TREND_CONFIG, computeTrend } from "@/lib/trends";

/* ─── Sales lookup type ─── */

type SalesLookup = Record<
  string,
  { recent90: number; prior90: number; hasSalesInLast180: boolean; hasSalesBefore180: boolean }
>;

/* ─── Filter types ─── */

type StatusFilter = "current" | "archived" | "all";
type TrendFilter = "all" | Trend;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

const TREND_OPTIONS: { value: TrendFilter; label: string }[] = [
  { value: "all", label: "All Trends" },
  { value: "growing", label: "Growing" },
  { value: "declining", label: "Declining" },
  { value: "stable", label: "Stable" },
  { value: "new", label: "New" },
];

/* ─── Sort types ─── */

type SortKey = "part" | "display_name" | "brand" | "fragrance" | "size" | "product_type" | "trend" | "forecast" | "media";
type SortDir = "asc" | "desc";

/* Media kit completeness: which parts have copy + assets */
type MediaStatus = { hasCopy: boolean; assetCount: number };
type MediaLookup = Record<string, MediaStatus>;

/* ─── Page ─── */

export default function ProductListPage() {
  const router = useRouter();
  const { brand } = useBrand();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("current");
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");

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

  /* Create blank product and navigate to its detail page */
  async function handleAddProduct() {
    setCreating(true);
    const sku = `NEW-${Date.now()}`;
    const { error } = await supabase.from("inventory_products").insert({
      part: sku,
      display_name: "",
      product_type: "FG",
      fragrance: "",
      size: "",
      part_type: "FG",
      brand: brand === "all" ? "NI" : brand,
      cogs: 0,
      min_qty: 0,
      max_qty: 0,
      is_forecasted: true,
      lead_time_months: 0,
      avg_monthly_demand: 0,
    });
    if (error) {
      console.error("Failed to create product", error);
      alert("Failed to create product. Please try again.");
      setCreating(false);
      return;
    }
    router.push(`/products/${encodeURIComponent(sku)}`);
  }

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

  /* ─── Filtering & Sorting ─── */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let result = products.filter((p) => {
      if (brand !== "all" && p.brand !== brand) return false;
      if (status === "current" && !p.is_forecasted) return false;
      if (status === "archived" && p.is_forecasted) return false;

      // Trend filter
      if (trendFilter !== "all") {
        const t = getTrend(p.part);
        if (t !== trendFilter) return false;
      }

      if (!q) return true;
      return (
        p.part.toLowerCase().includes(q) ||
        p.display_name?.toLowerCase().includes(q) ||
        p.fragrance?.toLowerCase().includes(q) ||
        p.part_type?.toLowerCase().includes(q)
      );
    });

    // Sort
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
  }, [products, query, status, brand, trendFilter, salesLookup, sortKey, sortDir, mediaLookup]);

  /* ─── Stats ─── */

  const brandProducts = products.filter(
    (p) => brand === "all" || p.brand === brand
  );
  const totalCount = brandProducts.length;
  const forecastCount = brandProducts.filter((p) => p.is_forecasted).length;
  const archivedCount = totalCount - forecastCount;

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

  /* ─── Render ─── */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      {/* Header row */}
      <PageHeader
        title="Product List"
        subtitle={`${totalCount} products · ${forecastCount} current · ${archivedCount} archived`}
      >
        <button
          onClick={handleAddProduct}
          disabled={creating}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition shadow-sm disabled:opacity-50"
        >
          <Plus size={16} />
          {creating ? "Creating…" : "Add Product"}
        </button>
      </PageHeader>

      {/* Toolbar: search + filters on one line */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, name, fragrance..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Status filter */}
          <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  status === opt.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Trend filter */}
          <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
            {TREND_OPTIONS.map((opt) => {
              const active = trendFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTrendFilter(opt.value)}
                  className={clsx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    active
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={clsx(
                    "px-4 py-3 font-medium select-none cursor-pointer hover:text-gray-600 transition-colors group",
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
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                    {p.part}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                    {p.display_name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                        p.brand === "NI"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-pink-50 text-pink-700"
                      )}
                    >
                      {p.brand}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {p.fragrance || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {p.size || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {p.product_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
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
                  <td className="px-4 py-3 text-center">
                    <MediaBadge status={mediaLookup[p.part]} />
                  </td>
                  <td
                    className="px-4 py-3 text-center"
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-gray-100 p-3 mb-3">
              <Search size={20} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">
              No products found
            </p>
            <p className="mt-1 text-sm text-gray-500 max-w-sm">
              {query
                ? "Try adjusting your search or filters."
                : "Add your first product to get started."}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className="text-xs text-gray-400">
          Showing {filtered.length} of {totalCount} products
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

const REQUIRED_ASSETS = 6; // front, benefits, lifestyle, ingredients, fragrance, other

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
