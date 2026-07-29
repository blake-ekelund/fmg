"use client";

import { useState, useEffect } from "react";
import { X, Tag, LayoutPanelTop, Link2 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { EmailBlock, PromotionBlock, TextBlock } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (block: EmailBlock) => void;
};

/** How the chosen discount gets inserted. */
type InsertFormat = "block" | "code";

/** A storefront discount (subset of the /api/storefront-discounts row). */
type Discount = {
  id: string;
  code: string;
  brand: "Sassy" | "NI" | "both";
  kind: "percent" | "fixed" | "free_item" | "free_shipping";
  value: number;
  free_shipping: boolean;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  unique_codes: boolean;
  note: string | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Human label for a discount's value, e.g. "20% OFF", "$15 OFF + FREE SHIPPING". */
function discountLabel(d: Discount): string {
  const parts: string[] = [];
  if (d.kind === "percent") parts.push(`${d.value}% OFF`);
  else if (d.kind === "fixed") parts.push(`$${d.value} OFF`);
  else if (d.kind === "free_item") parts.push("FREE ITEM");
  else if (d.kind === "free_shipping") parts.push("FREE SHIPPING");
  if (d.free_shipping && d.kind !== "free_shipping") parts.push("FREE SHIPPING");
  return parts.join(" + ");
}

/**
 * A storefront link that auto-applies the code via ?discount=CODE. Sassy's store
 * is live (sassyandco.com); "both" codes work on the only live store, so they
 * point there too. Natural Inspirations has no storefront yet, so NI-only codes
 * get a placeholder for the user to fill in.
 */
function storefrontUrl(d: Discount): string {
  if (d.brand === "NI") return "https://";
  return `https://sassyandco.com/?discount=${encodeURIComponent(d.code)}`;
}

/**
 * A customer-facing headline for the email block. Deliberately derived from the
 * offer — NOT from `note`, which is an internal admin memo and must never reach
 * a shopper. The user can edit it in the block editor afterward.
 */
function headlineFor(d: Discount): string {
  if (d.kind === "percent") return `Save ${d.value}%`;
  if (d.kind === "fixed") return `Save $${d.value}`;
  if (d.kind === "free_item") return "Free Gift";
  if (d.kind === "free_shipping") return "Free Shipping";
  return "Special Offer";
}

export default function PromotionPickerModal({ open, onClose, onSelect }: Props) {
  const [promos, setPromos] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<InsertFormat>("block");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/storefront-discounts", { headers: await authHeader() });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setError(json.error ?? "Couldn't load discounts.");
          return;
        }
        const now = Date.now();
        // Broadcast emails need a single shared code, so skip unique-code
        // batches (they mint one-time per-customer codes). Only show active,
        // not-yet-expired discounts.
        const usable = ((json.discounts ?? []) as Discount[]).filter(
          (d) =>
            d.active &&
            !d.unique_codes &&
            (!d.ends_at || new Date(d.ends_at).getTime() > now),
        );
        if (!cancelled) setPromos(usable);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load discounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  function newId() {
    return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /** The full styled promotion card. */
  function promotionBlock(d: Discount): PromotionBlock {
    const label = discountLabel(d);
    return {
      id: newId(),
      type: "promotion",
      promotionId: d.id,
      headline: headlineFor(d),
      description: `Use code ${d.code} for ${label.toLowerCase()} on your next order.`,
      promoCode: d.code,
      discountLabel: label,
      expiresLabel: d.ends_at
        ? `Expires ${new Date(d.ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
        : "",
      buttonText: `Use Code: ${d.code}`,
      buttonUrl: storefrontUrl(d),
      bgColor: "#f5f3ff",
      accentColor: "#7c3aed",
      textColor: "#1f2937",
      padding: 24,
    };
  }

  /** A compact one-line text block: the code, linked, with its offer. Set the
   * link's destination (your storefront) after inserting. */
  function codeBlock(d: Discount): TextBlock {
    return {
      id: newId(),
      type: "text",
      html: `Use code <strong><a href="${storefrontUrl(d)}">${d.code}</a></strong> for ${discountLabel(d).toLowerCase()}`,
      fontSize: 16,
      fontFamily: "sans",
      textAlign: "center",
      textColor: "#1f2937",
      bgColor: "#ffffff",
      padding: 16,
    };
  }

  function handleSelect(d: Discount) {
    onSelect(format === "code" ? codeBlock(d) : promotionBlock(d));
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
              <p className="text-[11px] text-gray-500">Pull an active discount code into the email</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Insert format */}
        <div className="flex items-center gap-1 border-b border-gray-100 px-4 py-2.5 shrink-0">
          {([
            { value: "block", label: "Full block", icon: LayoutPanelTop },
            { value: "code", label: "Linked code", icon: Link2 },
          ] as const).map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={clsx(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  format === opt.value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50",
                )}
              >
                <Icon size={13} />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading discounts...</div>
          ) : error ? (
            <div className="text-center py-8">
              <Tag size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">Couldn&apos;t load discounts</p>
              <p className="text-xs text-gray-400 mt-1">{error}</p>
            </div>
          ) : promos.length === 0 ? (
            <div className="text-center py-8">
              <Tag size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">No shareable discounts</p>
              <p className="text-xs text-gray-400 mt-1">
                Create an active, non-unique discount code on the Discounts page first.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {promos.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleSelect(d)}
                  className="w-full text-left rounded-xl border border-gray-200 px-4 py-3 hover:border-violet-300 hover:bg-violet-50 transition group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-800 group-hover:text-violet-800 truncate">
                      {d.note?.trim() || d.code}
                    </span>
                    <span className="font-mono text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-semibold shrink-0">
                      {d.code}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">{discountLabel(d)}</span>
                    <span>·</span>
                    <span>{d.brand === "both" ? "Both brands" : d.brand}</span>
                    {d.ends_at && (
                      <>
                        <span>·</span>
                        <span>
                          ends {new Date(d.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
