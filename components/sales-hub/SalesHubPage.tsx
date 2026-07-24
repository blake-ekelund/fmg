"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  DollarSign,
  ShoppingCart,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Package,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";

import {
  NI_BRAND,
  SASSY_BRAND,
  CHANNEL_ORDER,
  type BrandContent,
} from "@/lib/brandContent";


/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

type ChannelStats = {
  channel: string;
  customers: number;
  totalRevenue: number;
  ttmRevenue: number;
  priorTtmRevenue: number;
  totalOrders: number;
};

type FragranceStat = {
  fragrance: string;
  revenue: number;
  units: number;
  pctOfChannel: number;
};

type ProductGroupStat = {
  displayName: string;
  revenue: number;
  units: number;
  pctOfChannel: number;
  fragrances: FragranceStat[];
};

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function SalesHubPage() {
  const { brand } = useBrand();
  const [channelStats, setChannelStats] = useState<ChannelStats[]>([]);
  const [productsByChannel, setProductsByChannel] = useState<
    Record<string, ProductGroupStat[]>
  >({});
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string>("GIFT");
  const [copied, setCopied] = useState<string | null>(null);

  // Pick brand content based on context
  const activeBrand: BrandContent =
    brand === "Sassy" ? SASSY_BRAND : NI_BRAND;

  /* ── Data Loading ──
     Uses pre-aggregated views (sales_hub_channel_stats_v, sales_hub_product_breakdown_v)
     so the DB does the heavy lifting instead of fetching all raw orders + line items. */
  const loadData = useCallback(async () => {
    setLoading(true);

    const [channelRes, productRes] = await Promise.all([
      supabase
        .from("sales_hub_channel_stats_v")
        .select(
          "channel, brand, ttm_customers, ttm_orders, ttm_revenue, prior_ttm_revenue, total_revenue"
        ),
      supabase
        .from("sales_hub_product_breakdown_v")
        .select("channel, brand, display_name, fragrance, revenue, units")
        .range(0, 9999),
    ]);

    if (channelRes.error) console.error("channel stats error:", channelRes.error);
    if (productRes.error) console.error("product breakdown error:", productRes.error);

    type ChannelRow = {
      channel: string;
      brand: string;
      ttm_customers: number;
      ttm_orders: number;
      ttm_revenue: number;
      prior_ttm_revenue: number;
      total_revenue: number;
    };
    type ProductRow = {
      channel: string;
      brand: string;
      display_name: string;
      fragrance: string;
      revenue: number;
      units: number;
    };

    const channelRows = (channelRes.data as ChannelRow[] | null) ?? [];
    const productRows = (productRes.data as ProductRow[] | null) ?? [];

    /* ── Channel stats: collapse per-brand rows down to per-channel, filtered by brand ── */
    const channelMap: Record<string, ChannelStats> = {};
    for (const r of channelRows) {
      if (brand !== "all" && r.brand !== brand) continue;
      const existing = channelMap[r.channel];
      const ttmRev = Number(r.ttm_revenue) || 0;
      const priorRev = Number(r.prior_ttm_revenue) || 0;
      const total = Number(r.total_revenue) || 0;
      const ttmOrders = Number(r.ttm_orders) || 0;
      const ttmCust = Number(r.ttm_customers) || 0;
      if (!existing) {
        channelMap[r.channel] = {
          channel: r.channel,
          customers: ttmCust,
          totalRevenue: total,
          ttmRevenue: ttmRev,
          priorTtmRevenue: priorRev,
          totalOrders: ttmOrders,
        };
      } else {
        // "all" brand: sum NI + Sassy rows for the same channel
        existing.ttmRevenue += ttmRev;
        existing.priorTtmRevenue += priorRev;
        existing.totalRevenue += total;
        existing.totalOrders += ttmOrders;
        existing.customers += ttmCust;
      }
    }
    setChannelStats(
      Object.values(channelMap).sort((a, b) => b.ttmRevenue - a.ttmRevenue)
    );

    /* ── Product breakdown: group by channel -> display_name -> fragrance ── */
    const chProd: Record<
      string,
      Record<string, Record<string, { revenue: number; units: number }>>
    > = {};
    for (const r of productRows) {
      if (brand !== "all" && r.brand !== brand) continue;
      const ch = r.channel;
      const name = r.display_name || "—";
      const frag = r.fragrance || "—";
      if (!chProd[ch]) chProd[ch] = {};
      if (!chProd[ch][name]) chProd[ch][name] = {};
      if (!chProd[ch][name][frag])
        chProd[ch][name][frag] = { revenue: 0, units: 0 };
      chProd[ch][name][frag].revenue += Number(r.revenue) || 0;
      chProd[ch][name][frag].units += Number(r.units) || 0;
    }

    const result: Record<string, ProductGroupStat[]> = {};
    for (const [ch, prodGroups] of Object.entries(chProd)) {
      const channelTotal = Object.values(prodGroups).reduce(
        (s, frags) =>
          s + Object.values(frags).reduce((s2, f) => s2 + f.revenue, 0),
        0
      );
      result[ch] = Object.entries(prodGroups)
        .map(([displayName, frags]) => {
          const totalRev = Object.values(frags).reduce(
            (s, f) => s + f.revenue,
            0
          );
          const totalUnits = Object.values(frags).reduce(
            (s, f) => s + f.units,
            0
          );
          const fragrances: FragranceStat[] = Object.entries(frags)
            .map(([fragrance, f]) => ({
              fragrance,
              revenue: f.revenue,
              units: f.units,
              pctOfChannel:
                channelTotal > 0 ? (f.revenue / channelTotal) * 100 : 0,
            }))
            .sort((a, b) => b.revenue - a.revenue);
          return {
            displayName,
            revenue: totalRev,
            units: totalUnits,
            pctOfChannel:
              channelTotal > 0 ? (totalRev / channelTotal) * 100 : 0,
            fragrances,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);
    }
    setProductsByChannel(result);

    setLoading(false);
  }, [brand]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Helpers ── */
  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const channelStatsMap = useMemo(() => {
    const map: Record<string, ChannelStats> = {};
    channelStats.forEach((ch) => {
      map[ch.channel] = ch;
    });
    return map;
  }, [channelStats]);

  // Channels sorted by revenue (data channels first, then remaining from CHANNEL_ORDER)
  const sortedChannels = useMemo(() => {
    const withData = channelStats.map((c) => c.channel);
    const remaining = CHANNEL_ORDER.filter((ch) => !withData.includes(ch));
    return [...withData, ...remaining];
  }, [channelStats]);

  // Current channel data
  const stats = channelStatsMap[selectedChannel];
  const channelContent = activeBrand.channels[selectedChannel];
  const channelProducts = productsByChannel[selectedChannel] || [];
  const trend =
    stats && stats.priorTtmRevenue > 0
      ? Math.round(
          ((stats.ttmRevenue - stats.priorTtmRevenue) /
            stats.priorTtmRevenue) *
            100
        )
      : stats && stats.ttmRevenue > 0
        ? 100
        : 0;

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto relative">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 bg-white/70 flex items-center justify-center rounded-xl">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
            <span className="text-xs font-medium text-gray-500">Loading sales data…</span>
          </div>
        </div>
      )}

      {/* ── Mobile channel filter ──
             The desktop rail is a vertical list of 11 channels. On a phone that
             was a horizontal scroller, so everything past the first two or three
             was hidden off-screen with no affordance. A native picker puts the
             whole list one tap away and leads the page, since choosing a channel
             is what every other section on this page hangs off. */}
      {/* Sticky, because everything below it is downstream of this one choice
          and the page runs long on a phone — banner, KPIs, talking points,
          elevator pitch, then a 20-row table. Pinned at top-16 to sit directly
          under the fixed mobile nav (h-16), and full-bleed via -mx-4 so it
          reads as a bar rather than a floating control. The visible label is
          dropped once pinned — the select's own value says the channel, and
          the height is permanent screen real estate. */}
      <div className="md:hidden sticky top-16 z-20 -mx-4 mb-4 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="relative">
          <select
            id="channel-filter"
            aria-label="Channel"
            value={selectedChannel}
            onChange={(e) => {
              setSelectedChannel(e.target.value);
              setExpandedProducts(new Set());
            }}
            className="w-full appearance-none rounded-lg border border-line bg-surface py-2.5 pl-3 pr-9 text-sm font-medium text-ink transition focus:border-brand-400 focus:outline-none"
          >
            {sortedChannels.map((ch) => {
              const chStats = channelStatsMap[ch];
              return (
                <option key={ch} value={ch}>
                  {ch}
                  {chStats ? ` — $${(chStats.ttmRevenue / 1000).toFixed(0)}K` : ""}
                </option>
              );
            })}
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
        </div>
      </div>

      {/* ── Brand Quick Reference (compact banner) ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-amber-500" />
          <span className="text-xs font-semibold text-gray-900">
            {activeBrand.name}
          </span>
        </div>
        <div className="flex flex-col md:flex-row gap-4">
          {/* One-liner */}
          <div className="flex-1 rounded-lg bg-gray-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                  One-Liner
                </div>
                <p className="text-sm font-medium text-gray-900 leading-relaxed">
                  {activeBrand.oneLiner}
                </p>
              </div>
              <CopyBtn
                copied={copied === "oneliner"}
                onClick={() => copyText(activeBrand.oneLiner, "oneliner")}
              />
            </div>
          </div>
          {/* Target */}
          <div className="md:w-72 rounded-lg bg-amber-50 border border-amber-100 p-3">
            <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-1">
              Target Consumer
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              {activeBrand.targetConsumer}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Channel Selector + Detail ── */}
      <div className="flex flex-col md:flex-row gap-5">
        {/* Left — Channel Selector (desktop; mobile uses the picker above) */}
        <div className="hidden md:block md:w-56 shrink-0">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
            Select Channel
          </div>
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {sortedChannels.map((ch) => {
              const chStats = channelStatsMap[ch];
              const isActive = selectedChannel === ch;
              return (
                <button
                  key={ch}
                  onClick={() => {
                    setSelectedChannel(ch);
                    setExpandedProducts(new Set());
                  }}
                  className={clsx(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all whitespace-nowrap md:whitespace-normal",
                    isActive
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <span>{ch}</span>
                  {chStats && (
                    <span
                      className={clsx(
                        "text-[10px] tabular-nums",
                        isActive ? "text-gray-400" : "text-gray-400"
                      )}
                    >
                      ${(chStats.ttmRevenue / 1000).toFixed(0)}K
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right — Channel Detail */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Channel Header */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {selectedChannel}
                </h2>
                {channelContent && (
                  <div className="flex items-start gap-2 mt-1">
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {channelContent.usp}
                    </p>
                    <CopyBtn
                      copied={copied === "usp"}
                      onClick={() =>
                        copyText(channelContent.usp, "usp")
                      }
                    />
                  </div>
                )}
              </div>
              {stats && (
                <div
                  className={clsx(
                    "inline-flex items-center gap-1 text-xs font-semibold tabular-nums shrink-0 px-2 py-1 rounded-md",
                    trend > 0
                      ? "text-green-700 bg-green-50"
                      : trend < 0
                        ? "text-red-700 bg-red-50"
                        : "text-gray-500 bg-gray-50"
                  )}
                >
                  {trend > 0 ? (
                    <TrendingUp size={12} />
                  ) : trend < 0 ? (
                    <TrendingDown size={12} />
                  ) : (
                    <Minus size={12} />
                  )}
                  {trend > 0 ? "+" : ""}
                  {trend}% YoY
                </div>
              )}
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Customers"
                value={stats ? stats.customers.toLocaleString() : "—"}
                icon={<Users size={13} />}
              />
              <KpiCard
                label="TTM Revenue"
                value={
                  stats
                    ? `$${stats.ttmRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    : "—"
                }
                icon={<DollarSign size={13} />}
              />
              <KpiCard
                label="Total Orders"
                value={stats ? stats.totalOrders.toLocaleString() : "—"}
                icon={<ShoppingCart size={13} />}
              />
              <KpiCard
                label="Avg / Customer"
                value={
                  stats && stats.customers > 0
                    ? `$${Math.round(stats.ttmRevenue / stats.customers).toLocaleString()}`
                    : "—"
                }
                icon={<TrendingUp size={13} />}
              />
            </div>
          </div>

          {/* Talking Points */}
          {channelContent && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={13} className="text-amber-500" />
                <h3 className="text-xs font-semibold text-gray-900">
                  Talking Points
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {channelContent.talkingPoints.map((tp, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 py-1.5"
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-semibold text-gray-500">
                        {i + 1}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {tp}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Elevator Pitch (collapsible) */}
          <details className="rounded-xl border border-gray-200 bg-white group">
            <summary className="px-5 py-4 cursor-pointer flex items-center justify-between text-xs font-semibold text-gray-900 list-none">
              <span>Brand Elevator Pitch</span>
              <ChevronDown
                size={14}
                className="text-gray-400 group-open:rotate-180 transition-transform"
              />
            </summary>
            <div className="px-5 pb-5 space-y-4">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {activeBrand.elevator}
                  </p>
                  <CopyBtn
                    copied={copied === "elevator"}
                    onClick={() =>
                      copyText(activeBrand.elevator, "elevator")
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {activeBrand.pillars.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-100 p-3"
                  >
                    <div className="text-xs font-semibold text-gray-900 mb-1">
                      {p.title}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      {p.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* Product Breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package size={13} className="text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-900">
                Product &amp; Fragrance Breakdown
              </h3>
              <span className="text-[10px] text-gray-400">TTM</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Loading product data…
              </div>
            ) : channelProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                No product data available for this channel yet.
              </div>
            ) : (
              <>
              {/* Desktop: table. Mobile gets cards below — four numeric columns
                  plus a progress bar don't survive a 390px viewport. */}
              <div className="hidden md:block rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-500">
                        Product
                      </th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-right">
                        Revenue
                      </th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-right hidden sm:table-cell">
                        Units
                      </th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-right">
                        % of Channel
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {channelProducts.slice(0, 20).map((p) => {
                      const prodKey = `${selectedChannel}::${p.displayName}`;
                      const isProductExpanded =
                        expandedProducts.has(prodKey);
                      const hasFragrances = p.fragrances.length > 1;
                      return (
                        <React.Fragment key={p.displayName}>
                          <tr
                            className={clsx(
                              "transition-colors",
                              hasFragrances
                                ? "cursor-pointer hover:bg-gray-50"
                                : "hover:bg-gray-50/50"
                            )}
                            onClick={() => {
                              if (!hasFragrances) return;
                              setExpandedProducts((prev) => {
                                const next = new Set(prev);
                                next.has(prodKey)
                                  ? next.delete(prodKey)
                                  : next.add(prodKey);
                                return next;
                              });
                            }}
                          >
                            <td className="px-3 py-2.5 text-gray-900 font-medium">
                              <div className="flex items-center gap-1.5">
                                {hasFragrances && (
                                  <span className="text-gray-400 shrink-0">
                                    {isProductExpanded ? (
                                      <ChevronUp size={12} />
                                    ) : (
                                      <ChevronDown size={12} />
                                    )}
                                  </span>
                                )}
                                <span className="truncate" title={p.displayName}>
                                  {p.displayName}
                                </span>
                                {hasFragrances && (
                                  <span className="text-[10px] text-gray-400 shrink-0">
                                    {p.fragrances.length}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-gray-900 tabular-nums text-right font-medium">
                              $
                              {p.revenue.toLocaleString("en-US", {
                                maximumFractionDigits: 0,
                              })}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 tabular-nums text-right hidden sm:table-cell">
                              {p.units.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden md:block">
                                  <div
                                    className="h-full bg-gray-900 rounded-full"
                                    style={{
                                      width: `${Math.min(p.pctOfChannel, 100)}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-gray-900 tabular-nums font-medium w-10 text-right">
                                  {p.pctOfChannel.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                          {isProductExpanded &&
                            p.fragrances.map((f) => (
                              <tr
                                key={f.fragrance}
                                className="bg-gray-50/60"
                              >
                                <td className="px-3 py-1.5 pl-9 text-gray-500 text-[11px]">
                                  {f.fragrance}
                                </td>
                                <td className="px-3 py-1.5 text-gray-600 tabular-nums text-right text-[11px]">
                                  $
                                  {f.revenue.toLocaleString("en-US", {
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                                <td className="px-3 py-1.5 text-gray-400 tabular-nums text-right text-[11px] hidden sm:table-cell">
                                  {f.units.toLocaleString()}
                                </td>
                                <td className="px-3 py-1.5 text-right text-[11px]">
                                  <span className="text-gray-400 tabular-nums">
                                    {f.pctOfChannel.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {channelProducts.length > 20 && (
                  <div className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">
                    Showing top 20 of {channelProducts.length} products
                  </div>
                )}
              </div>

              {/* Mobile: one card per product, tap to reveal fragrances */}
              <ul className="space-y-2 md:hidden">
                {channelProducts.slice(0, 20).map((p) => {
                  const prodKey = `${selectedChannel}::${p.displayName}`;
                  const isProductExpanded = expandedProducts.has(prodKey);
                  const hasFragrances = p.fragrances.length > 1;
                  return (
                    <li
                      key={p.displayName}
                      className="rounded-lg border border-gray-100 overflow-hidden"
                    >
                      <button
                        type="button"
                        disabled={!hasFragrances}
                        aria-expanded={hasFragrances ? isProductExpanded : undefined}
                        onClick={() =>
                          setExpandedProducts((prev) => {
                            const next = new Set(prev);
                            if (next.has(prodKey)) next.delete(prodKey);
                            else next.add(prodKey);
                            return next;
                          })
                        }
                        className="w-full px-3 py-2.5 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs font-medium text-gray-900">
                            {p.displayName}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-gray-900 tabular-nums">
                            $
                            {p.revenue.toLocaleString("en-US", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-gray-900"
                              style={{ width: `${Math.min(p.pctOfChannel, 100)}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[10px] font-medium tabular-nums text-gray-900">
                            {p.pctOfChannel.toFixed(1)}%
                          </span>
                        </div>

                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
                          <span className="tabular-nums">
                            {p.units.toLocaleString()} units
                          </span>
                          {hasFragrances && (
                            <span className="inline-flex items-center gap-0.5">
                              {p.fragrances.length} fragrances
                              {isProductExpanded ? (
                                <ChevronUp size={11} />
                              ) : (
                                <ChevronDown size={11} />
                              )}
                            </span>
                          )}
                        </div>
                      </button>

                      {isProductExpanded && (
                        <ul className="space-y-1.5 border-t border-gray-100 bg-gray-50/60 px-3 py-2">
                          {p.fragrances.map((f) => (
                            <li
                              key={f.fragrance}
                              className="flex items-baseline justify-between gap-3 text-[11px]"
                            >
                              <span className="min-w-0 truncate text-gray-500">
                                {f.fragrance}
                              </span>
                              <span className="shrink-0 tabular-nums text-gray-600">
                                $
                                {f.revenue.toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })}
                                <span className="ml-1.5 text-gray-400">
                                  {f.pctOfChannel.toFixed(1)}%
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              {channelProducts.length > 20 && (
                <p className="mt-2 text-[11px] text-gray-400 md:hidden">
                  Showing top 20 of {channelProducts.length} products
                </p>
              )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-gray-400">{icon}</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-sm font-semibold text-gray-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function CopyBtn({
  copied,
  onClick,
}: {
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-gray-400 hover:text-gray-600 transition shrink-0"
      title="Copy"
    >
      {copied ? (
        <Check size={12} className="text-green-500" />
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}
