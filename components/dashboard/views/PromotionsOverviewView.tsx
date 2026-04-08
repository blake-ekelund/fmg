"use client";

import {
  Tag,
  Percent,
  DollarSign,
  Truck,
  Gift,
  ShoppingBag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import {
  useDashboardPromotions,
  type DashboardPromotion,
} from "../hooks/useDashboardPromotions";

const DISCOUNT_ICONS: Record<string, typeof Percent> = {
  percentage: Percent,
  fixed_amount: DollarSign,
  free_shipping: Truck,
  buy_x_get_y: Gift,
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  active: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle2 },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
  draft: { bg: "bg-gray-100", text: "text-gray-600", icon: Tag },
  paused: { bg: "bg-yellow-100", text: "text-yellow-700", icon: AlertTriangle },
  expired: { bg: "bg-orange-100", text: "text-orange-700", icon: AlertTriangle },
};

function formatDiscount(p: DashboardPromotion): string {
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

export default function PromotionsOverviewView() {
  const { promotions, stats, loading } = useDashboardPromotions();

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (promotions.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <Tag size={20} className="text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-700 mb-1">No promotions yet</h3>
        <p className="text-xs text-gray-400 mb-3">
          Create your first promotion to see stats here.
        </p>
        <Link
          href="/promotions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-900 hover:text-gray-700 transition"
        >
          Go to Promotions <ArrowRight size={12} />
        </Link>
      </div>
    );
  }

  // Show active + scheduled first, then recent
  const activePromos = promotions.filter((p) => p.status === "active" || p.status === "scheduled").slice(0, 5);
  const displayPromos = activePromos.length > 0 ? activePromos : promotions.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Active", value: stats.active, color: "text-green-600" },
          { label: "Scheduled", value: stats.scheduled, color: "text-blue-600" },
          { label: "Total", value: stats.total, color: "text-gray-600" },
          { label: "Redemptions", value: stats.totalRedemptions, color: "text-violet-600" },
        ].map((s) => (
          <div key={s.label} className="text-center py-2 rounded-lg bg-gray-50">
            <div className={clsx("text-lg font-semibold", s.color)}>{s.value}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Promo list */}
      <div className="space-y-1.5">
        {displayPromos.map((p) => {
          const DiscIcon = DISCOUNT_ICONS[p.discount_type] || Tag;
          const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.draft;

          return (
            <div
              key={p.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <DiscIcon size={14} className="text-amber-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                  <span className={clsx("px-1.5 py-0.5 rounded-full text-[9px] font-medium", statusStyle.bg, statusStyle.text)}>
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                  <span className="font-medium text-gray-500">{formatDiscount(p)}</span>
                  {p.code && (
                    <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">{p.code}</span>
                  )}
                  {p.channel === "d2c" && (
                    <span className="flex items-center gap-0.5 text-violet-500">
                      <ShoppingBag size={9} /> Shopify
                    </span>
                  )}
                  <span>{p.current_uses}{p.max_uses ? `/${p.max_uses}` : ""} uses</span>
                </div>
              </div>

              {p.shopify_synced && (
                <div className="px-1.5 py-1 rounded bg-green-50">
                  <ShoppingBag size={10} className="text-green-500" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/promotions"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          View all promotions <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
