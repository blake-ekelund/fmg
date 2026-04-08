"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Check, Mail, MessageSquare, Newspaper, Tag } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { TemplateType, Brand, Channel } from "./types";
import type { Promotion } from "@/components/promotions/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
};

type ProductOption = {
  part: string;
  display_name: string;
  fragrance: string | null;
  brand: string;
};

const SUPABASE_FN_URL =
  "https://vxisjubwezhxfxocoawk.supabase.co/functions/v1/generate-email-template";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aXNqdWJ3ZXpoeGZ4b2NvYXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDcyNDMsImV4cCI6MjA4NDYyMzI0M30.F7-Yg5JVryMzueXtaOz8TIunbhC-QxUgJz89ZWKxO6Q";

const PURPOSE_SUGGESTIONS: Record<TemplateType, string[]> = {
  email: [
    "Welcome new wholesale customer",
    "Win-back at-risk customer with 15% off",
    "New product launch announcement",
    "Seasonal promotion — Summer collection",
    "Thank you for your recent order",
    "Reorder reminder with bestseller recommendations",
  ],
  sms: [
    "Flash sale — 20% off for 48 hours",
    "New product drop alert",
    "Order shipped confirmation",
    "Abandoned cart reminder",
    "VIP early access to seasonal collection",
  ],
  newsletter: [
    "Monthly newsletter — new products, tips, and behind the scenes",
    "Seasonal lookbook with product recommendations",
    "Self-care guide featuring our bestsellers",
    "Year in review — highlights and what's coming next",
    "Holiday gift guide with curated sets",
  ],
};

export default function GenerateTemplateModal({ open, onClose, onGenerated }: Props) {
  const [templateType, setTemplateType] = useState<TemplateType>("email");
  const [brand, setBrand] = useState<"NI" | "Sassy">("NI");
  const [channel, setChannel] = useState<Channel>("both");
  const [purpose, setPurpose] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productsOpen, setProductsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [emailPromos, setEmailPromos] = useState<Promotion[]>([]);

  // Load products + active email promotions
  useEffect(() => {
    if (!open) return;
    async function loadProducts() {
      const { data } = await supabase
        .from("inventory_products")
        .select("part, display_name, fragrance, brand")
        .in("brand", ["NI", "Sassy"])
        .not("display_name", "ilike", "%TESTER%")
        .not("display_name", "ilike", "%Marketing%")
        .not("display_name", "ilike", "%Sample%")
        .order("display_name")
        .order("fragrance");
      if (data) setProductOptions(data as ProductOption[]);
    }
    async function loadEmailPromos() {
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("status", "active")
        .contains("press_channels", ["email"]);
      if (data) setEmailPromos(data as Promotion[]);
    }
    loadProducts();
    loadEmailPromos();
  }, [open]);

  const filteredProducts = productOptions.filter((p) => p.brand === brand);

  useEffect(() => {
    setSelectedProducts([]);
  }, [brand]);

  function toggleProduct(part: string) {
    setSelectedProducts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  }

  function getProductLabel(part: string) {
    const p = productOptions.find((o) => o.part === part);
    if (!p) return part;
    return `${p.display_name}${p.fragrance ? ` — ${p.fragrance}` : ""}`;
  }

  if (!open) return null;

  function buildPromotionContext(): string | undefined {
    if (emailPromos.length === 0) return undefined;
    return emailPromos.map((p) => {
      const parts: string[] = [`Promotion: "${p.name}"`];
      if (p.code) parts.push(`Code: ${p.code}`);
      if (p.discount_type === "percentage" && p.discount_value) parts.push(`${p.discount_value}% off`);
      if (p.discount_type === "free_shipping") parts.push("Free shipping");
      if (p.starts_at) parts.push(`Starts: ${new Date(p.starts_at).toLocaleDateString()}`);
      if (p.ends_at) parts.push(`Ends: ${new Date(p.ends_at).toLocaleDateString()}`);
      if (p.minimum_purchase) parts.push(`Min purchase: $${p.minimum_purchase}`);
      return parts.join(" | ");
    }).join("\n");
  }

  async function handleSubmit() {
    if (!purpose.trim()) return;
    setGenerating(true);

    const submitPurpose = purpose.trim();
    const submitBrand = brand;
    const submitProducts = selectedProducts
      .map((part) => productOptions.find((p) => p.part === part))
      .filter(Boolean)
      .map((p) => p!.display_name);

    const promoContext = buildPromotionContext();
    let enrichedPurpose = submitPurpose;
    if (promoContext) {
      enrichedPurpose += `\n\n---\nIMPORTANT: Include the following active promotion in this template. Feature the promo code prominently and mention the savings.\n${promoContext}`;
    }

    // 1. Insert placeholder row
    const { data: inserted } = await supabase
      .from("email_templates")
      .insert({
        name: submitPurpose.slice(0, 80),
        type: templateType,
        brand: submitBrand === "NI" ? "ni" : "sassy",
        channel,
        status: "draft",
        blocks: [],
        subject: "",
        sms_body: templateType === "sms" ? "Generating..." : null,
      })
      .select("id")
      .single();

    const rowId = inserted?.id;
    if (!rowId) {
      setGenerating(false);
      return;
    }

    // 2. Fire edge function
    try {
      const res = await fetch(SUPABASE_FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          row_id: rowId,
          brand: submitBrand,
          template_type: templateType,
          purpose: enrichedPurpose,
          products: submitProducts.length > 0 ? submitProducts : undefined,
          promotion: promoContext || undefined,
        }),
      });

      if (!res.ok) {
        console.error("Edge function error:", await res.text());
      }
    } catch (e) {
      console.error("Edge function call failed:", e);
    }

    // 3. Reset & close
    setPurpose("");
    setSelectedProducts([]);
    setGenerating(false);
    onClose();
    onGenerated();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Generate Template with AI</h2>
              <p className="text-[11px] text-gray-500">Tell Claude what to create</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Template type */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Template Type
            </label>
            <div className="flex gap-2">
              {([
                { type: "email" as TemplateType, label: "Email", icon: Mail, color: "blue" },
                { type: "sms" as TemplateType, label: "SMS / Text", icon: MessageSquare, color: "violet" },
                { type: "newsletter" as TemplateType, label: "Newsletter", icon: Newspaper, color: "amber" },
              ]).map((t) => (
                <button
                  key={t.type}
                  onClick={() => setTemplateType(t.type)}
                  className={clsx(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition",
                    templateType === t.type
                      ? t.color === "blue"
                        ? "bg-blue-100 text-blue-700 ring-2 ring-blue-200"
                        : t.color === "violet"
                        ? "bg-violet-100 text-violet-700 ring-2 ring-violet-200"
                        : "bg-amber-100 text-amber-700 ring-2 ring-amber-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                  )}
                >
                  <t.icon size={16} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Brand */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Brand
            </label>
            <div className="flex gap-2">
              {(["NI", "Sassy"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={clsx(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition",
                    brand === b
                      ? b === "NI"
                        ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200"
                        : "bg-pink-100 text-pink-700 ring-2 ring-pink-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                  )}
                >
                  {b === "NI" ? "Natural Inspirations" : "Sassy"}
                </button>
              ))}
            </div>
          </div>

          {/* Channel */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Audience
            </label>
            <div className="flex gap-2">
              {([
                { value: "both" as Channel, label: "Both" },
                { value: "wholesale" as Channel, label: "Wholesale" },
                { value: "d2c" as Channel, label: "D2C" },
              ]).map((c) => (
                <button
                  key={c.value}
                  onClick={() => setChannel(c.value)}
                  className={clsx(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition",
                    channel === c.value
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active email promotion banner */}
          {emailPromos.length > 0 && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <Tag size={13} className="text-violet-600" />
                <span className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider">
                  Active Promotion{emailPromos.length > 1 ? "s" : ""} — will be included
                </span>
              </div>
              {emailPromos.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm text-violet-800 mt-1">
                  <span className="font-semibold">{p.name}</span>
                  {p.code && (
                    <span className="px-1.5 py-0.5 rounded bg-violet-200 text-[11px] font-mono font-semibold">
                      {p.code}
                    </span>
                  )}
                  <span className="text-violet-500 text-xs">
                    {p.discount_type === "percentage" && p.discount_value
                      ? `${p.discount_value}% off`
                      : p.discount_type === "free_shipping"
                        ? "Free shipping"
                        : ""}
                    {p.ends_at &&
                      ` · ends ${new Date(p.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Purpose */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              What is this template for?
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="Describe the purpose, tone, offer, or campaign..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition resize-none"
            />
            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PURPOSE_SUGGESTIONS[templateType].slice(0, 4).map((s) => (
                <button
                  key={s}
                  onClick={() => setPurpose(s)}
                  className={clsx(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition border",
                    purpose === s
                      ? "bg-purple-100 text-purple-700 border-purple-200"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Products */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Feature Products{" "}
              <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
            </label>
            <button
              onClick={() => setProductsOpen(!productsOpen)}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition"
            >
              <span className={selectedProducts.length ? "text-gray-900" : "text-gray-400"}>
                {selectedProducts.length
                  ? `${selectedProducts.length} product${selectedProducts.length > 1 ? "s" : ""} selected`
                  : "Select products to feature..."}
              </span>
              <svg
                className={clsx("w-4 h-4 text-gray-400 transition", productsOpen && "rotate-180")}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {productsOpen && (
              <div className="mt-1.5 rounded-lg border border-gray-200 bg-white max-h-40 overflow-y-auto shadow-sm">
                {filteredProducts.map((p) => (
                  <button
                    key={p.part}
                    onClick={() => toggleProduct(p.part)}
                    className={clsx(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition border-b border-gray-50 last:border-0",
                      selectedProducts.includes(p.part) && "bg-purple-50"
                    )}
                  >
                    <div
                      className={clsx(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition",
                        selectedProducts.includes(p.part)
                          ? "bg-purple-600 border-purple-600"
                          : "border-gray-300"
                      )}
                    >
                      {selectedProducts.includes(p.part) && <Check size={10} className="text-white" />}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-mono text-gray-400 shrink-0">{p.part}</span>
                      <span className="text-gray-700 truncate">{p.display_name}</span>
                      {p.fragrance && <span className="text-[11px] text-gray-400 shrink-0">· {p.fragrance}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedProducts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedProducts.map((part) => (
                  <span
                    key={part}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[11px] font-medium"
                  >
                    {getProductLabel(part)}
                    <button onClick={() => toggleProduct(part)} className="hover:text-purple-900">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!purpose.trim() || generating}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50"
          >
            <Sparkles size={14} />
            {generating ? "Generating..." : "Generate Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
