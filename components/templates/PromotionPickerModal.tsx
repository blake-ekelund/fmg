"use client";

import { useState, useEffect } from "react";
import { X, Tag } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { Promotion } from "@/components/promotions/types";
import type { PromotionBlock } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (block: PromotionBlock) => void;
};

export default function PromotionPickerModal({ open, onClose, onSelect }: Props) {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .in("status", ["active", "scheduled"])
        .order("created_at", { ascending: false });
      if (data) setPromos(data as Promotion[]);
      setLoading(false);
    }
    load();
  }, [open]);

  if (!open) return null;

  function handleSelect(promo: Promotion) {
    const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const discountLabel =
      promo.discount_type === "percentage" && promo.discount_value
        ? `${promo.discount_value}% OFF`
        : promo.discount_type === "free_shipping"
          ? "FREE SHIPPING"
          : "";

    const expiresLabel = promo.ends_at
      ? `Expires ${new Date(promo.ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
      : "";

    const block: PromotionBlock = {
      id,
      type: "promotion",
      promotionId: promo.id,
      headline: promo.name,
      description: promo.code
        ? `Use code ${promo.code} for ${discountLabel.toLowerCase()} on your next order.`
        : `Enjoy ${discountLabel.toLowerCase()} on your next order.`,
      promoCode: promo.code || "",
      discountLabel,
      expiresLabel,
      buttonText: promo.code ? `Use Code: ${promo.code}` : "Shop Now",
      buttonUrl: "https://",
      bgColor: "#f5f3ff",
      accentColor: "#7c3aed",
      textColor: "#1f2937",
      padding: 24,
    };

    onSelect(block);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Tag size={16} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Insert Promotion</h2>
              <p className="text-[11px] text-gray-500">Select an active promotion to add</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading promotions...</div>
          ) : promos.length === 0 ? (
            <div className="text-center py-8">
              <Tag size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">No active promotions</p>
              <p className="text-xs text-gray-400 mt-1">
                Create a promotion on the Promotions page first.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {promos.map((p) => {
                const discountText =
                  p.discount_type === "percentage" && p.discount_value
                    ? `${p.discount_value}% off`
                    : p.discount_type === "free_shipping"
                      ? "Free shipping"
                      : "";

                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    className="w-full text-left rounded-xl border border-gray-200 px-4 py-3 hover:border-violet-300 hover:bg-violet-50 transition group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800 group-hover:text-violet-800">
                        {p.name}
                      </span>
                      {p.code && (
                        <span className="font-mono text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-semibold">
                          {p.code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {discountText && <span>{discountText}</span>}
                      {p.ends_at && (
                        <>
                          <span>·</span>
                          <span>
                            ends {new Date(p.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </>
                      )}
                      {p.channel && (
                        <>
                          <span>·</span>
                          <span className="capitalize">{p.channel}</span>
                        </>
                      )}
                    </div>
                    {p.press_channels && p.press_channels.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {p.press_channels.map((ch) => (
                          <span
                            key={ch}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
