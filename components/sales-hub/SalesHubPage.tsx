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

/* ═══════════════════════════════════════════════════════════
   BRAND CONTENT — NI vs Sassy
   ═══════════════════════════════════════════════════════════ */

type BrandContent = {
  name: string;
  oneLiner: string;
  elevator: string;
  pillars: { title: string; detail: string }[];
  targetConsumer: string;
  channels: Record<string, { usp: string; talkingPoints: string[] }>;
};

const NI_BRAND: BrandContent = {
  name: "Natural Inspirations",
  oneLiner:
    "Spa-inspired personal care where clean fragrance meets spa-grade performance and ingredient integrity.",
  elevator:
    'Natural Inspirations combines gorgeous, clean fragrances with spa-grade formulations and a clear ingredient philosophy — "Indulge in the Good. Eliminate the Bad." Every product delivers a sensory self-care experience that feels luxurious, trustworthy, and aligned with modern values.',
  pillars: [
    {
      title: "Beautiful, Clean Fragrance",
      detail:
        "Fresh, comforting, and elevated — never heavy, synthetic, or overpowering.",
    },
    {
      title: "Spa-Grade Formulations",
      detail:
        "Rich textures, high-performance blends, and professional-quality results.",
    },
    {
      title: "Ingredient Integrity",
      detail:
        'Cold-pressed seed oils and the proprietary ExSeed® Antioxidant Complex. Guided by "Indulge in the Good. Eliminate the Bad."',
    },
  ],
  targetConsumer:
    "Women ages 35–65 who love clean, spa-inspired fragrances, want skincare that feels indulgent but not artificial, and value performance, comfort, and sensory experience.",
  channels: {
    GIFT: {
      usp: "Beautifully packaged, giftable self-care that smells incredible and feels luxurious.",
      talkingPoints: [
        "Strong gifting appeal — fragrance-forward, spa-quality products",
        "Clean ingredient story resonates with gift buyers",
        "Premium look and feel at accessible price points",
        "Great for seasonal sets, holidays, and everyday gifting",
      ],
    },
    "SALON/SPA": {
      usp: "Professional-grade formulations that match what spas already use — at retail-friendly margins.",
      talkingPoints: [
        "Spa-grade textures and performance clients already expect",
        "Clean ingredient story aligns with wellness positioning",
        "ExSeed® Antioxidant Complex is a unique differentiator",
        "Retail add-on opportunity after treatments",
      ],
    },
    PHARMACY: {
      usp: "Clean, trusted personal care with spa-quality results — positioned above mass, below clinical.",
      talkingPoints: [
        '"Indulge in the Good" philosophy resonates with health-conscious shoppers',
        "Clean ingredient list is easy for pharmacists to endorse",
        "Elevated packaging stands out on shelf",
        "Strong replenishment and repeat purchase patterns",
      ],
    },
    "NAT/GROCERY": {
      usp: "Clean-label personal care that delivers on fragrance and performance — not just ingredients.",
      talkingPoints: [
        "Meets clean beauty standards without compromising on experience",
        "Fragrance-forward approach differentiates from clinical competitors",
        'Appeals to the growing "premium self-care" aisle',
        "Strong crossover with natural food / wellness shoppers",
      ],
    },
    HOSPITAL: {
      usp: "Gentle, clean-ingredient personal care that feels comforting for patients and staff.",
      talkingPoints: [
        "Soothing fragrances designed for sensitive environments",
        "Clean ingredient philosophy aligns with healthcare values",
        "Spa-grade quality elevates patient experience",
        "Gift shop retail opportunity",
      ],
    },
    DISTRIBUTOR: {
      usp: "A proven, multi-channel brand with strong margins and a clear positioning story.",
      talkingPoints: [
        "Sells across gift, spa, pharmacy, and specialty channels",
        "Consistent brand story makes it easy to pitch to sub-accounts",
        "Clean + fragrance + spa is a unique tri-pillar positioning",
        "Marketing support and brand assets available",
      ],
    },
    HARDWARE: {
      usp: "Premium personal care gifting that stands out in non-traditional retail environments.",
      talkingPoints: [
        "Strong gifting appeal drives incremental basket size",
        "Attracts female shoppers into non-traditional aisles",
        "Clean, spa-quality story differentiates from commodity products",
      ],
    },
    WEB: {
      usp: "Direct-to-consumer clean beauty with gorgeous fragrance — optimized for discovery and subscription.",
      talkingPoints: [
        "Fragrance-first story performs well in digital marketing",
        "Clean ingredient list builds trust for online buyers",
        "High-AOV potential with sets and bundles",
        "Strong review and repeat purchase rates",
      ],
    },
    FLOWER: {
      usp: "The perfect complement to floral gifts — spa-quality self-care that smells as beautiful as the arrangement.",
      talkingPoints: [
        "Natural pairing with floral gifting occasions",
        "Fragrance-forward products align with the sensory experience",
        "Premium add-on that increases average order value",
      ],
    },
    CASINOS: {
      usp: "Upscale amenity-grade personal care that enhances the guest experience.",
      talkingPoints: [
        "Spa-grade quality expected in premium hospitality",
        "Clean ingredient story appeals to health-conscious guests",
        "Gift shop retail opportunity alongside amenity placement",
      ],
    },
    "SOCIAL SELLER": {
      usp: 'A clean beauty brand with a compelling story that practically sells itself in social settings.',
      talkingPoints: [
        'Strong fragrance-first hook — "smell this" is the easiest close',
        "Clean ingredient story builds trust and repeat orders",
        "Spa-quality positioning feels premium, not MLM",
      ],
    },
  },
};

const SASSY_BRAND: BrandContent = {
  name: "Sassy by Natural Inspirations",
  oneLiner:
    "Bold, fun, and unapologetically fragrant personal care for the woman who wants to stand out.",
  elevator:
    "Sassy takes the clean, spa-grade foundation of Natural Inspirations and turns the volume up. Bolder fragrances, playful branding, and an attitude that says self-care should be fun — not fussy. Every product is designed to make you feel confident, energized, and a little bit extra.",
  pillars: [
    {
      title: "Bold Fragrance",
      detail:
        "Statement scents that are fun, flirty, and impossible to ignore — designed to turn heads.",
    },
    {
      title: "Playful & Confident",
      detail:
        "Vibrant packaging and branding that celebrates personality and self-expression.",
    },
    {
      title: "Clean Foundation",
      detail:
        "Built on the same spa-grade, clean ingredient philosophy as NI — but with more attitude.",
    },
  ],
  targetConsumer:
    "Women ages 20–45 who want personal care that matches their personality — bold, fun, and expressive. She shops for products that spark joy and make a statement.",
  channels: {
    GIFT: {
      usp: "Eye-catching, personality-driven gifts that stand out on the shelf and make an impression.",
      talkingPoints: [
        "Bold, fun packaging is instantly giftable",
        "Unique fragrance names create conversation",
        "Appeals to younger gift buyers looking for personality",
        "Impulse-buy friendly price points and sizing",
      ],
    },
    "SALON/SPA": {
      usp: "A fun, youthful retail add-on that brings energy to your spa boutique.",
      talkingPoints: [
        "Attracts a younger demographic to the retail area",
        "Playful branding complements the serious spa experience",
        "Clean ingredients clients can trust",
        "High margin, low commitment retail offering",
      ],
    },
    PHARMACY: {
      usp: "A vibrant, clean personal care line that energizes the beauty aisle.",
      talkingPoints: [
        "Bold packaging pops on shelf and drives discovery",
        "Clean ingredient story satisfies the health-conscious shopper",
        "Fun fragrance names create engagement",
        "Bridges the gap between mass and prestige",
      ],
    },
    "NAT/GROCERY": {
      usp: "Clean personal care with personality — not boring, not basic.",
      talkingPoints: [
        "Stands out in a sea of muted, clinical-looking products",
        "Clean ingredients meet natural grocery standards",
        "Fun branding appeals to younger natural shoppers",
        "Cross-merchandising potential with lifestyle products",
      ],
    },
    HOSPITAL: {
      usp: "A cheerful self-care gift option for hospital gift shops.",
      talkingPoints: [
        "Bright packaging lifts spirits — perfect for get-well gifts",
        "Clean, gentle formulations for sensitive situations",
        "Affordable price points for impulse gift purchases",
        "Complements NI for broader demographic coverage",
      ],
    },
    DISTRIBUTOR: {
      usp: "A complementary brand to NI that captures a younger, bolder demographic.",
      talkingPoints: [
        "Dual-brand strategy covers wider market",
        "Sassy opens doors NI might not — younger, trendier accounts",
        "Same quality foundation, different positioning",
        "Strong social media appeal drives pull-through",
      ],
    },
    HARDWARE: {
      usp: "A fun, affordable gifting option that appeals to a broader audience.",
      talkingPoints: [
        "Playful branding attracts impulse buyers",
        "Lower price points fit hardware store gift budgets",
        "Bold packaging creates a mini destination in-store",
      ],
    },
    WEB: {
      usp: "Social-media-ready personal care with personality built for virality.",
      talkingPoints: [
        "Instagram/TikTok-friendly branding and packaging",
        "Fun fragrance names drive curiosity clicks",
        "Strong review and share potential",
        "Subscription and bundle-friendly format",
      ],
    },
    FLOWER: {
      usp: "A fun, colorful add-on gift that complements floral arrangements with personality.",
      talkingPoints: [
        "Bright packaging pairs well with flower bouquets",
        "Affordable add-on that boosts order value",
        "Appeals to a younger gifting demographic",
      ],
    },
    CASINOS: {
      usp: "A vibrant, fun amenity option that adds personality to the guest experience.",
      talkingPoints: [
        "Bold branding fits the energy of casino environments",
        "Fun, memorable fragrances enhance the stay",
        "Retail opportunity in casino gift shops",
      ],
    },
    "SOCIAL SELLER": {
      usp: "The brand practically sells itself — bold, fun, and made for social.",
      talkingPoints: [
        "Packaging and names are instant conversation starters",
        "Social-media-ready products drive organic sharing",
        "Fun positioning makes selling feel effortless",
      ],
    },
  },
};

const CHANNEL_ORDER = [
  "GIFT",
  "SALON/SPA",
  "PHARMACY",
  "NAT/GROCERY",
  "HOSPITAL",
  "DISTRIBUTOR",
  "HARDWARE",
  "WEB",
  "FLOWER",
  "CASINOS",
  "SOCIAL SELLER",
];

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

  /* ── Data Loading ── */
  const loadData = useCallback(async () => {
    setLoading(true);

    // ── Fetch all raw data once ──
    const ttmStart = new Date();
    ttmStart.setFullYear(ttmStart.getFullYear() - 1);
    const ttmStartStr = ttmStart.toISOString().slice(0, 10);

    // Prior TTM window (12-24 months ago)
    const priorStart = new Date();
    priorStart.setFullYear(priorStart.getFullYear() - 2);
    const priorStartStr = priorStart.toISOString().slice(0, 10);

    // Fetch ALL orders in date range (paginate to avoid 1000-row default limit)
    let allOrders: Record<string, unknown>[] = [];
    const ORDER_PAGE = 1000;
    let orderOffset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch, error: ordErr } = await supabase
        .from("sales_orders_raw")
        .select("id, channel, customerid, datecompleted, totalprice")
        .gte("datecompleted", priorStartStr)
        .range(orderOffset, orderOffset + ORDER_PAGE - 1);

      if (ordErr) {
        console.error("Sales Hub orders error:", ordErr);
        break;
      }
      if (batch && batch.length > 0) {
        allOrders = allOrders.concat(batch as Record<string, unknown>[]);
        orderOffset += ORDER_PAGE;
        hasMore = batch.length === ORDER_PAGE;
      } else {
        hasMore = false;
      }
    }
    const orders = allOrders;

    // Fetch product master with brand
    const { data: products } = await supabase
      .from("inventory_products")
      .select("part, display_name, fragrance, brand");

    const prodLookup: Record<
      string,
      { displayName: string; fragrance: string; brand: string }
    > = {};
    if (products) {
      (products as Record<string, unknown>[]).forEach((p) => {
        prodLookup[p.part as string] = {
          displayName: (p.display_name as string) || (p.part as string),
          fragrance: (p.fragrance as string) || "—",
          brand: (p.brand as string) || "NI",
        };
      });
    }

    if (orders && orders.length > 0) {
      // Build order lookups (deduplicate by order id — same order may appear in multiple uploads)
      const orderChannel: Record<number, string> = {};
      const orderDate: Record<number, string> = {};
      const orderCustomer: Record<number, string> = {};
      const orderTotal: Record<number, number> = {};
      orders.forEach((o: Record<string, unknown>) => {
        const id = o.id as number;
        const ch = (o.channel as string) || "None";
        if (id && ch !== "None") {
          if (!orderChannel[id]) {
            orderChannel[id] = ch;
            orderDate[id] = (o.datecompleted as string) || "";
            orderCustomer[id] = (o.customerid as string) || "";
            orderTotal[id] = (o.totalprice as number) || 0;
          }
        }
      });

      // Fetch all line items (use small order batches + paginate within each to avoid 1000-row limit)
      const orderIds = Object.keys(orderChannel).map(Number);
      let allItems: Record<string, unknown>[] = [];
      const BATCH = 200; // smaller batches so items per batch stay under limits
      for (let i = 0; i < orderIds.length; i += BATCH) {
        const batch = orderIds.slice(i, i + BATCH);
        let offset = 0;
        let fetching = true;
        while (fetching) {
          const { data: items } = await supabase
            .from("so_items_raw")
            .select("id, soid, productnum, description, totalprice, qtyfulfilled")
            .in("soid", batch)
            .range(offset, offset + 999);
          if (items && items.length > 0) {
            allItems = allItems.concat(items as Record<string, unknown>[]);
            offset += 1000;
            fetching = items.length === 1000;
          } else {
            fetching = false;
          }
        }
      }

      // ── Deduplicate line items (same item can appear in multiple uploads) ──
      const seenItems = new Set<string>();
      const uniqueItems = allItems.filter((item) => {
        const soid = item.soid as number;
        const itemId = item.id as number | null;
        const key = itemId
          ? `${soid}-${itemId}`
          : `${soid}-${item.productnum}-${item.totalprice}`;
        if (seenItems.has(key)) return false;
        seenItems.add(key);
        return true;
      });

      // ── For brand filtering: build set of orders that contain matching brand products ──
      const ordersMatchingBrand = new Set<number>();
      if (brand !== "all") {
        uniqueItems.forEach((item) => {
          const soid = item.soid as number;
          const pnum = (item.productnum as string) || "Unknown";
          const prod = prodLookup[pnum];
          const itemBrand = prod?.brand || "NI";
          if (itemBrand === brand) ordersMatchingBrand.add(soid);
        });
      }

      // ── Build channel stats from ORDER-LEVEL totalprice (not line items) ──
      const channelMap: Record<string, ChannelStats> = {};
      const channelCustomers: Record<string, Set<string>> = {};
      const channelOrders: Record<string, Set<number>> = {};

      // Iterate over deduplicated orders and use order-level totalprice
      Object.keys(orderChannel).forEach((idStr) => {
        const id = Number(idStr);
        const ch = orderChannel[id];
        if (!ch) return;

        // Brand filter: for specific brand, only include orders with at least one matching product
        if (brand !== "all" && !ordersMatchingBrand.has(id)) return;

        const date = orderDate[id] || "";
        const oTotal = orderTotal[id] || 0;
        const isTTM = date >= ttmStartStr;
        const isPriorTTM = date >= priorStartStr && date < ttmStartStr;

        if (!channelMap[ch]) {
          channelMap[ch] = {
            channel: ch, customers: 0, totalRevenue: 0,
            ttmRevenue: 0, priorTtmRevenue: 0, totalOrders: 0,
          };
          channelCustomers[ch] = new Set();
          channelOrders[ch] = new Set();
        }
        if (isTTM) {
          channelMap[ch].ttmRevenue += oTotal;
          channelCustomers[ch].add(orderCustomer[id]);
          channelOrders[ch].add(id);
        }
        if (isPriorTTM) {
          channelMap[ch].priorTtmRevenue += oTotal;
        }
        channelMap[ch].totalRevenue += oTotal;
      });

      // ── Product breakdown from line items (TTM only) ──
      const chProd: Record<
        string,
        Record<string, Record<string, { revenue: number; units: number }>>
      > = {};

      uniqueItems.forEach((item) => {
        const soid = item.soid as number;
        const ch = orderChannel[soid];
        if (!ch) return;

        const pnum = (item.productnum as string) || "Unknown";
        const desc = ((item.description as string) || pnum).toUpperCase();
        if (
          pnum === "Subtotal" || pnum === "Shipping" ||
          desc === "SUBTOTAL" || desc === "SHIPPING"
        ) return;

        const prod = prodLookup[pnum];
        const itemBrand = prod?.brand || "NI";

        // Brand filter: skip items that don't match selected brand
        if (brand !== "all" && itemBrand !== brand) return;

        const rev = (item.totalprice as number) || 0;
        const qty = (item.qtyfulfilled as number) || 0;
        const date = orderDate[soid] || "";
        const isTTM = date >= ttmStartStr;

        // Product breakdown (TTM only)
        if (isTTM) {
          const displayName = prod?.displayName || (item.description as string) || pnum;
          const fragrance = prod?.fragrance || "—";
          if (!chProd[ch]) chProd[ch] = {};
          if (!chProd[ch][displayName]) chProd[ch][displayName] = {};
          if (!chProd[ch][displayName][fragrance])
            chProd[ch][displayName][fragrance] = { revenue: 0, units: 0 };
          chProd[ch][displayName][fragrance].revenue += rev;
          chProd[ch][displayName][fragrance].units += qty;
        }
      });

      // Finalize channel stats
      Object.keys(channelMap).forEach((ch) => {
        channelMap[ch].customers = channelCustomers[ch].size;
        channelMap[ch].totalOrders = channelOrders[ch].size;
      });
      setChannelStats(
        Object.values(channelMap).sort((a, b) => b.ttmRevenue - a.ttmRevenue)
      );

      // Finalize product breakdown
      const result: Record<string, ProductGroupStat[]> = {};
      Object.entries(chProd).forEach(([ch, prodGroups]) => {
        const channelTotal = Object.values(prodGroups).reduce(
          (s, frags) =>
            s + Object.values(frags).reduce((s2, f) => s2 + f.revenue, 0),
          0
        );
        result[ch] = Object.entries(prodGroups)
          .map(([displayName, frags]) => {
            const totalRev = Object.values(frags).reduce(
              (s, f) => s + f.revenue, 0
            );
            const totalUnits = Object.values(frags).reduce(
              (s, f) => s + f.units, 0
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
      });
      setProductsByChannel(result);
    }

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
        {/* Left — Channel Selector */}
        <div className="md:w-56 shrink-0">
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
              <div className="rounded-lg border border-gray-100 overflow-hidden">
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
