"use client";

import {
  Tag,
  Percent,
  DollarSign,
  Truck,
  Gift,
  ShoppingBag,
  ArrowRight,
  Copy,
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

function daysLeft(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const diff = Math.ceil((new Date(endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "Expired";
  if (diff === 0) return "Ends today";
  if (diff === 1) return "1 day left";
  return `${diff} days left`;
}

export default function ActivePromotionsView() {
  const { promotions, loading } = useDashboardPromotions();

  const active = promotions.filter((p) => p.status === "active");

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (active.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-3">
          <Tag size={20} className="text-green-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-700 mb-1">No active promotions</h3>
        <p className="text-xs text-gray-400 mb-3">
          Activate a promotion to see it here.
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

  return (
    <div className="space-y-2">
      {active.map((p) => {
        const DiscIcon = DISCOUNT_ICONS[p.discount_type] || Tag;
        const remaining = daysLeft(p.ends_at);
        const usagePercent = p.max_uses ? Math.min(100, (p.current_uses / p.max_uses) * 100) : null;

        return (
          <div
            key={p.id}
            className="rounded-xl border border-gray-100 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                <DiscIcon size={16} className="text-green-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 truncate">{p.name}</span>
                  {p.channel === "d2c" && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-50 text-[10px] text-violet-600 font-medium">
                      <ShoppingBag size={9} /> Shopify
                    </span>
                  )}
                  {p.shopify_synced && (
                    <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-[10px] text-green-600 font-medium">
                      Synced
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs font-medium text-gray-600">{formatDiscount(p)}</span>
                  {p.code && (
                    <button
                      onClick={() => navigator.clipboard.writeText(p.code!)}
                      className="inline-flex items-center gap-1 font-mono bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded text-[11px] text-gray-600 transition"
                    >
                      {p.code} <Copy size={9} className="text-gray-400" />
                    </button>
                  )}
                  {remaining && (
                    <span
                      className={clsx(
                        "text-[11px] font-medium",
                        remaining === "Ends today" || remaining === "1 day left"
                          ? "text-red-500"
                          : "text-gray-400"
                      )}
                    >
                      {remaining}
                    </span>
                  )}
                </div>

                {/* Usage bar */}
                {usagePercent !== null && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">
                        {p.current_uses} / {p.max_uses} redemptions
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {Math.round(usagePercent)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          "h-full rounded-full",
                          usagePercent >= 90 ? "bg-red-400" :
                          usagePercent >= 50 ? "bg-amber-400" :
                          "bg-green-400"
                        )}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {usagePercent === null && (
                  <div className="mt-1.5 text-[11px] text-gray-400">
                    {p.current_uses} redemptions (unlimited)
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/promotions"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Manage promotions <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
