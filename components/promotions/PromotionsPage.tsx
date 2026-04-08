"use client";

import { useState, useEffect } from "react";
import {
  Tag,
  Plus,
  Percent,
  DollarSign,
  Truck,
  Gift,
  ShoppingBag,
  Store,
  Globe,
  Copy,
  Trash2,
  Pencil,
  MoreHorizontal,
  Search,
  Filter,
  ArrowUpDown,
  Pause,
  Play,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import clsx from "clsx";
import { usePromotions } from "./usePromotions";
import CreatePromotionModal from "./CreatePromotionModal";
import type {
  Promotion,
  PromotionStatus,
  PromotionChannel,
  DiscountType,
} from "./types";
import { STATUS_CONFIG, CHANNEL_LABELS } from "./types";

/* ─── Types ─── */
type ShopifyDiscount = {
  id: string;
  shopify_id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  once_per_customer: boolean;
  min_subtotal: number | null;
  primary_code: string | null;
  codes: { id: number; code: string; usage_count: number }[];
  total_usage: number;
  created_at: string;
  performance: {
    total_orders: number;
    total_revenue: number;
    total_discount_given: number;
    avg_order_value: number;
  };
};

type ShopifyDiscountsData = {
  connected: boolean;
  discounts: ShopifyDiscount[];
  summary: {
    total: number;
    active: number;
    expired: number;
    scheduled: number;
    total_orders_with_discounts: number;
    total_revenue_from_discounts: number;
    total_discount_amount: number;
  };
};

/** Unified row type for sorting */
type UnifiedRow =
  | { kind: "shopify"; data: ShopifyDiscount; revenue: number }
  | { kind: "local"; data: Promotion; revenue: number };

/* ─── Constants ─── */
const DISCOUNT_ICONS: Record<string, typeof Percent> = {
  percentage: Percent,
  fixed_amount: DollarSign,
  free_shipping: Truck,
  buy_x_get_y: Gift,
};

const CHANNEL_ICONS: Record<PromotionChannel, typeof ShoppingBag> = {
  d2c: ShoppingBag,
  wholesale: Store,
  both: Globe,
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-green-100", text: "text-green-700" },
  expired: { bg: "bg-orange-100", text: "text-orange-700" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700" },
  draft: { bg: "bg-gray-100", text: "text-gray-600" },
  paused: { bg: "bg-yellow-100", text: "text-yellow-700" },
};

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDiscount(p: Promotion): string {
  switch (p.discount_type) {
    case "percentage":
      return `${p.discount_value}% off`;
    case "fixed_amount":
      return `$${p.discount_value?.toFixed(2)} off`;
    case "free_shipping":
      return "Free shipping";
    case "buy_x_get_y":
      return `Buy ${p.buy_quantity} Get ${p.get_quantity}`;
    default:
      return "";
  }
}

function formatShopifyDiscount(d: ShopifyDiscount): string {
  switch (d.discount_type) {
    case "percentage":
      return `${d.discount_value}% off`;
    case "fixed_amount":
      return `$${d.discount_value.toFixed(2)} off`;
    case "free_shipping":
      return "Free shipping";
    default:
      return `${d.discount_value}% off`;
  }
}

function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "";
  const start = new Date(startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!endsAt) return `From ${start}`;
  const end = new Date(endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${start} - ${end}`;
}

type StatusFilter = "all" | "active_all" | PromotionStatus;

export default function PromotionsPage() {
  const { promotions, loading, save, remove, duplicate, refresh } = usePromotions();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all" as StatusFilter);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Shopify data
  const [shopifyData, setShopifyData] = useState<ShopifyDiscountsData | null>(null);
  const [shopifyLoading, setShopifyLoading] = useState(true);

  function loadShopify() {
    setShopifyLoading(true);
    fetch("/api/shopify/discounts")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) setShopifyData(data);
        else setShopifyData(null);
      })
      .catch(() => setShopifyData(null))
      .finally(() => setShopifyLoading(false));
  }

  useEffect(() => { loadShopify(); }, []);

  const shopifySummary = shopifyData?.summary;

  // Build a lookup of Shopify performance by price rule ID
  const allShopifyDiscounts = shopifyData?.discounts || [];
  const shopifyPerfMap = new Map(
    allShopifyDiscounts.map((d) => [d.shopify_id, d.performance])
  );

  // Deduplicate: exclude Shopify rows that are already tracked locally via shopify_discount_id
  const syncedShopifyIds = new Set(
    promotions.filter((p) => p.shopify_discount_id).map((p) => p.shopify_discount_id!)
  );
  const shopifyDiscounts = allShopifyDiscounts.filter(
    (d) => !syncedShopifyIds.has(d.shopify_id)
  );

  const hideExpired = statusFilter === "active_all";
  const effectiveStatus = statusFilter === "active_all" ? "all" : statusFilter;

  // Filter local promotions
  const filteredLocal = promotions.filter((p) => {
    if (hideExpired && p.status === "expired") return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.code || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (effectiveStatus !== "all" && p.status !== effectiveStatus) return false;
    return true;
  });

  // Filter Shopify-only promotions (ones not tracked locally)
  const filteredShopify = shopifyDiscounts.filter((d) => {
    if (hideExpired && d.status === "expired") return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !(d.primary_code || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (effectiveStatus !== "all" && d.status !== effectiveStatus) return false;
    return true;
  });

  // Merge and sort by revenue descending
  const unifiedRows: UnifiedRow[] = [
    ...filteredShopify.map((d): UnifiedRow => ({ kind: "shopify", data: d, revenue: d.performance.total_revenue })),
    ...filteredLocal.map((p): UnifiedRow => {
      const perf = p.shopify_discount_id ? shopifyPerfMap.get(p.shopify_discount_id) : undefined;
      return { kind: "local", data: p, revenue: perf?.total_revenue || 0 };
    }),
  ].sort((a, b) => b.revenue - a.revenue);

  // Combined stats
  const localActive = promotions.filter((p) => p.status === "active").length;
  const shopifyActive = shopifySummary?.active || 0;
  const totalActive = localActive + shopifyActive;
  const totalOrders = shopifySummary?.total_orders_with_discounts || 0;
  const totalRevenue = shopifySummary?.total_revenue_from_discounts || 0;
  const totalSavings = shopifySummary?.total_discount_amount || 0;
  const totalAOV = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  async function handleSyncToShopify(promoId: string) {
    setSyncing(promoId);
    try {
      const res = await fetch("/api/promotions/sync-shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotion_id: promoId }),
      });
      const data = await res.json();
      if (data.success) {
        await refresh();
        loadShopify();
      } else {
        alert(data.message || data.error || "Sync failed");
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setSyncing(null);
    }
  }

  /** Modal callback: save then immediately sync to Shopify */
  async function handleSaveAndSync(promo: Partial<Promotion>) {
    // Save locally first
    await save(promo);
    // Find the saved promotion (newest one with this name)
    // We need to refresh to get the ID
    const refreshed = await refresh();
    const saved = (refreshed || promotions).find(
      (p) => p.name === promo.name && p.code === promo.code
    );
    if (saved) {
      await handleSyncToShopify(saved.id);
    }
  }

  function handleEdit(p: Promotion) {
    setEditing(p);
    setShowModal(true);
    setMenuOpen(null);
  }

  async function handleStatusToggle(p: Promotion) {
    const newStatus: PromotionStatus = p.status === "active" ? "paused" : "active";
    await save({ id: p.id, status: newStatus });
    setMenuOpen(null);
  }

  async function handleDelete(id: string) {
    await remove(id);
    setConfirmDelete(null);
    setMenuOpen(null);
  }

  const isLoading = loading || shopifyLoading;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Promotions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage promotions across Shopify and wholesale.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shadow-sm"
        >
          <Plus size={16} />
          New Promotion
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Active", value: totalActive.toString(), icon: CheckCircle2, color: "green" },
          { label: "Orders", value: totalOrders.toLocaleString(), icon: ShoppingBag, color: "violet" },
          { label: "Revenue", value: fmt(totalRevenue), icon: TrendingUp, color: "emerald" },
          { label: "Savings", value: fmt(totalSavings), icon: Tag, color: "amber" },
          { label: "AOV", value: fmt(totalAOV), icon: ArrowUpDown, color: "blue" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
            <div className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              s.color === "green" ? "bg-green-100" :
              s.color === "violet" ? "bg-violet-100" :
              s.color === "emerald" ? "bg-emerald-100" :
              s.color === "amber" ? "bg-amber-100" :
              "bg-blue-100"
            )}>
              <s.icon size={16} className={clsx(
                s.color === "green" ? "text-green-600" :
                s.color === "violet" ? "text-violet-600" :
                s.color === "emerald" ? "text-emerald-600" :
                s.color === "amber" ? "text-amber-600" :
                "text-blue-600"
              )} />
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">{s.value}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code..."
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            <option value="all">All Statuses</option>
            <option value="active_all">Hide Expired</option>
            <option value="active">Active Only</option>
            <option value="scheduled">Scheduled Only</option>
            <option value="expired">Expired Only</option>
            <option value="draft">Draft Only</option>
            <option value="paused">Paused Only</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Loading promotions...</span>
          </div>
        </div>
      ) : unifiedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-gray-200 bg-white/60">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Tag size={24} className="text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            {promotions.length === 0 && shopifyDiscounts.length === 0 ? "No promotions yet" : "No matching promotions"}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm text-center">
            {promotions.length === 0 && shopifyDiscounts.length === 0
              ? "Create your first promotion for Shopify or wholesale orders."
              : "Try adjusting your filters or search term."}
          </p>
          {promotions.length === 0 && shopifyDiscounts.length === 0 && (
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
            >
              <Plus size={14} /> Create Promotion
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {unifiedRows.map((row) => {
            if (row.kind === "shopify") {
              const d = row.data;
              const DiscIcon = DISCOUNT_ICONS[d.discount_type] || Percent;
              const ss = STATUS_STYLES[d.status] || STATUS_STYLES.active;
              const perf = d.performance;

              return (
                <div key={`shopify-${d.id}`} className="bg-white rounded-xl border border-gray-100 hover:border-violet-200 transition">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                      <DiscIcon size={18} className="text-violet-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">{d.title}</span>
                        <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-medium", ss.bg, ss.text)}>
                          {d.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="font-medium text-gray-600">{formatShopifyDiscount(d)}</span>
                        {d.primary_code && (
                          <button
                            onClick={() => navigator.clipboard.writeText(d.primary_code!)}
                            className="inline-flex items-center gap-1 font-mono bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded text-[10px] text-gray-600 transition"
                          >
                            {d.primary_code} <Copy size={8} className="text-gray-400" />
                          </button>
                        )}
                        {d.once_per_customer && (
                          <span className="text-[10px] text-violet-500">1 per customer</span>
                        )}
                        <span>{formatDateRange(d.starts_at, d.ends_at)}</span>
                      </div>
                    </div>

                    {/* Performance metrics */}
                    <div className="hidden md:grid grid-cols-4 shrink-0" style={{ width: "340px" }}>
                      <div className="text-center py-1">
                        <div className="text-sm font-semibold text-gray-800">{perf.total_orders}</div>
                        <div className="text-[9px] text-gray-400 uppercase">Orders</div>
                      </div>
                      <div className="text-center py-1 border-l border-gray-100">
                        <div className="text-sm font-semibold text-green-700">{fmt(perf.total_revenue)}</div>
                        <div className="text-[9px] text-gray-400 uppercase">Revenue</div>
                      </div>
                      <div className="text-center py-1 border-l border-gray-100">
                        <div className="text-sm font-semibold text-amber-600">{fmt(perf.total_discount_given)}</div>
                        <div className="text-[9px] text-gray-400 uppercase">Savings</div>
                      </div>
                      <div className="text-center py-1 border-l border-gray-100">
                        <div className="text-sm font-semibold text-gray-600">{fmt(perf.avg_order_value)}</div>
                        <div className="text-[9px] text-gray-400 uppercase">AOV</div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile performance row */}
                  <div className="md:hidden grid grid-cols-4 gap-1 px-5 pb-3">
                    {[
                      { label: "Orders", value: perf.total_orders.toString() },
                      { label: "Revenue", value: fmt(perf.total_revenue) },
                      { label: "Savings", value: fmt(perf.total_discount_given) },
                      { label: "AOV", value: fmt(perf.avg_order_value) },
                    ].map((m) => (
                      <div key={m.label} className="bg-gray-50 rounded-lg py-1.5 text-center">
                        <div className="text-xs font-semibold text-gray-700">{m.value}</div>
                        <div className="text-[9px] text-gray-400">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            // ─── Local promotion row ───
            const p = row.data as Promotion;
            const DiscIcon = DISCOUNT_ICONS[p.discount_type];
            const ChanIcon = CHANNEL_ICONS[p.channel];
            const statusCfg = STATUS_CONFIG[p.status];
            const needsSync = p.channel === "d2c" && !p.shopify_synced;
            const isDraft = p.status === "draft";
            const isPaused = p.status === "paused";
            const localPerf = p.shopify_discount_id ? shopifyPerfMap.get(p.shopify_discount_id) : undefined;

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition group"
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <DiscIcon size={18} className="text-amber-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(p)}
                        className="text-sm font-semibold text-gray-900 truncate hover:text-gray-700 transition"
                      >
                        {p.name}
                      </button>
                      <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-medium", statusCfg.bg, statusCfg.color)}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="font-medium text-gray-600">{formatDiscount(p)}</span>
                      {p.code && (
                        <button
                          onClick={() => navigator.clipboard.writeText(p.code!)}
                          className="inline-flex items-center gap-1 font-mono bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded text-[10px] text-gray-600 transition"
                        >
                          {p.code} <Copy size={8} className="text-gray-400" />
                        </button>
                      )}
                      <span className="flex items-center gap-1">
                        <ChanIcon size={10} />
                        {CHANNEL_LABELS[p.channel]}
                      </span>
                      {p.minimum_purchase && (
                        <span>Min ${p.minimum_purchase.toFixed(2)}</span>
                      )}
                      <span className="hidden sm:inline">{formatDateRange(p.starts_at, p.ends_at)}</span>
                      {p.press_channels?.length > 0 && (
                        <span className="hidden sm:inline-flex items-center gap-1">
                          {p.press_channels.includes("blog") && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">Blog</span>
                          )}
                          {p.press_channels.includes("social") && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">Social</span>
                          )}
                          {p.press_channels.includes("email") && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">Email</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Performance metrics (when synced to Shopify) */}
                  {localPerf && (
                    <div className="hidden md:grid grid-cols-4 shrink-0" style={{ width: "340px" }}>
                      <div className="text-center py-1">
                        <div className="text-sm font-semibold text-gray-800">{localPerf.total_orders}</div>
                        <div className="text-[9px] text-gray-400 uppercase">Orders</div>
                      </div>
                      <div className="text-center py-1 border-l border-gray-100">
                        <div className="text-sm font-semibold text-green-700">{fmt(localPerf.total_revenue)}</div>
                        <div className="text-[9px] text-gray-400 uppercase">Revenue</div>
                      </div>
                      <div className="text-center py-1 border-l border-gray-100">
                        <div className="text-sm font-semibold text-amber-600">{fmt(localPerf.total_discount_given)}</div>
                        <div className="text-[9px] text-gray-400 uppercase">Savings</div>
                      </div>
                      <div className="text-center py-1 border-l border-gray-100">
                        <div className="text-sm font-semibold text-gray-600">{fmt(localPerf.avg_order_value)}</div>
                        <div className="text-[9px] text-gray-400 uppercase">AOV</div>
                      </div>
                    </div>
                  )}

                  {/* Action buttons — surfaced based on state */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Primary action: Sync / Activate / Pause */}
                    {needsSync && (
                      <button
                        onClick={() => handleSyncToShopify(p.id)}
                        disabled={syncing === p.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition disabled:opacity-50"
                      >
                        {syncing === p.id ? (
                          <><RefreshCw size={11} className="animate-spin" /> Syncing</>
                        ) : (
                          <><ShoppingBag size={11} /> Sync to Shopify</>
                        )}
                      </button>
                    )}
                    {(isDraft || isPaused) && !needsSync && (
                      <button
                        onClick={() => handleStatusToggle(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition"
                      >
                        <Play size={11} /> Activate
                      </button>
                    )}
                    {p.status === "active" && (
                      <button
                        onClick={() => handleStatusToggle(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 transition opacity-0 group-hover:opacity-100"
                      >
                        <Pause size={11} /> Pause
                      </button>
                    )}

                    {p.shopify_synced && (
                      <div className="px-2 py-1 rounded-md bg-green-50 border border-green-100" title="Synced to Shopify">
                        <ShoppingBag size={12} className="text-green-600" />
                      </div>
                    )}

                    {/* More menu */}
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === p.id ? null : p.id)}
                        className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {menuOpen === p.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-44">
                            <button onClick={() => handleEdit(p)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                              <Pencil size={12} /> Edit
                            </button>
                            <button onClick={() => handleStatusToggle(p)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                              {p.status === "active" ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
                            </button>
                            <button
                              onClick={async () => { await duplicate(p.id); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <Copy size={12} /> Duplicate
                            </button>
                            {p.channel === "d2c" && (
                              <button
                                onClick={async () => { setMenuOpen(null); await handleSyncToShopify(p.id); }}
                                disabled={syncing === p.id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-600 hover:bg-violet-50 disabled:opacity-50"
                              >
                                {syncing === p.id ? (
                                  <><RefreshCw size={12} className="animate-spin" /> Syncing...</>
                                ) : p.shopify_synced ? (
                                  <><RefreshCw size={12} /> Re-sync to Shopify</>
                                ) : (
                                  <><ShoppingBag size={12} /> Sync to Shopify</>
                                )}
                              </button>
                            )}
                            <div className="border-t border-gray-100 my-1" />
                            {confirmDelete === p.id ? (
                              <button onClick={() => handleDelete(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 font-medium">
                                <Trash2 size={12} /> Confirm Delete
                              </button>
                            ) : (
                              <button onClick={() => setConfirmDelete(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50">
                                <Trash2 size={12} /> Delete
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <CreatePromotionModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSave={save}
        onSaveAndSync={handleSaveAndSync}
        editing={editing}
      />
    </div>
  );
}
