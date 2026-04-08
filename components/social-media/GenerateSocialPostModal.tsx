"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Check, Tag } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
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

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aXNqdWJ3ZXpoeGZ4b2NvYXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDcyNDMsImV4cCI6MjA4NDYyMzI0M30.F7-Yg5JVryMzueXtaOz8TIunbhC-QxUgJz89ZWKxO6Q";

const POST_TYPES = [
  { value: "carousel", label: "Carousel" },
  { value: "reel", label: "Reel" },
] as const;

export default function GenerateSocialPostModal({ open, onClose, onGenerated }: Props) {
  const [brand, setBrand] = useState<"NI" | "Sassy">("NI");
  const [postType, setPostType] = useState("carousel");
  const [direction, setDirection] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productsOpen, setProductsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [socialPromos, setSocialPromos] = useState<Promotion[]>([]);

  // Load products + active social promotions
  useEffect(() => {
    if (!open) return;
    async function load() {
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
    async function loadSocialPromos() {
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("status", "active")
        .contains("press_channels", ["social"]);
      if (data) setSocialPromos(data as Promotion[]);
    }
    load();
    loadSocialPromos();
  }, [open]);

  const filteredProducts = productOptions.filter((p) => p.brand === brand);

  useEffect(() => { setSelectedProducts([]); }, [brand]);

  function toggleProduct(part: string) {
    setSelectedProducts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  }

  function getProductLabel(part: string) {
    const p = productOptions.find((o) => o.part === part);
    return p ? `${p.display_name}${p.fragrance ? ` — ${p.fragrance}` : ""}` : part;
  }

  /** Build a concise promotion summary for the AI prompt */
  function buildPromotionContext(): string | undefined {
    if (socialPromos.length === 0) return undefined;

    return socialPromos.map((p) => {
      const parts: string[] = [`Promotion: "${p.name}"`];
      if (p.code) parts.push(`Code: ${p.code}`);
      if (p.discount_type === "percentage" && p.discount_value)
        parts.push(`${p.discount_value}% off`);
      if (p.discount_type === "free_shipping")
        parts.push("Free shipping");
      if (p.starts_at)
        parts.push(`Starts: ${new Date(p.starts_at).toLocaleDateString()}`);
      if (p.ends_at)
        parts.push(`Ends: ${new Date(p.ends_at).toLocaleDateString()}`);
      if (p.minimum_purchase)
        parts.push(`Min purchase: $${p.minimum_purchase}`);
      if (p.applies_to === "specific_collections" && p.collection_tags?.length)
        parts.push(`Applies to: ${p.collection_tags.join(", ")}`);
      return parts.join(" | ");
    }).join("\n");
  }

  if (!open) return null;

  async function handleSubmit() {
    if (!direction.trim() || submitting) return;
    setSubmitting(true);

    const submitDirection = direction.trim();
    const submitBrand = brand;
    const submitPostType = postType;
    const submitProducts = selectedProducts
      .map((part) => productOptions.find((p) => p.part === part))
      .filter(Boolean)
      .map((p) => p!.display_name);

    // Build promotion context for AI
    const promoContext = buildPromotionContext();

    // Append promotion instructions to direction
    let enrichedDirection = submitDirection;
    if (promoContext) {
      enrichedDirection += `\n\n---\nIMPORTANT: Naturally reference the following active promotion in this social post. Work the promo code and savings into the caption in a way that feels engaging and native to social media. Include the promo code prominently.\n${promoContext}`;
    }

    // Insert placeholder
    const { data: inserted, error: insertErr } = await supabase
      .from("social_media_posts")
      .insert({
        brand: submitBrand,
        platform: "Instagram / Facebook",
        post_type: submitPostType,
        post_date: new Date().toISOString().split("T")[0],
        caption: "Generating...",
        status: "generating",
        hashtags: null,
        cta: null,
        image_direction: null,
        image_ref_url: null,
        tags: null,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Social post insert failed:", insertErr);
      setSubmitting(false);
      return;
    }

    const rowId = inserted?.id;

    // Reset & close
    setDirection("");
    setSelectedProducts([]);
    setSubmitting(false);
    onClose();
    onGenerated();

    // Fire edge function
    fetch("https://vxisjubwezhxfxocoawk.supabase.co/functions/v1/generate-social-posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        mode: "single",
        brand: submitBrand,
        platform: "Instagram / Facebook",
        post_type: submitPostType,
        direction: enrichedDirection,
        row_id: rowId,
        products: submitProducts.length > 0 ? submitProducts : undefined,
        promotion: promoContext || undefined,
      }),
    })
      .then(async (res) => {
        onGenerated();
        if (res.ok) {
          try {
            const data = await res.json();
            const rc = data.render_carousel;
            if (rc?.post_id && rc?.carousel_slides?.length) {
              fetch("https://vxisjubwezhxfxocoawk.supabase.co/functions/v1/render-carousel", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify(rc),
              }).then(() => onGenerated()).catch(() => {});
            }
          } catch {}
        }
      })
      .catch(() => {
        if (rowId) {
          supabase
            .from("social_media_posts")
            .update({ status: "ai_draft", caption: "Generation failed. Please try again." })
            .eq("id", rowId)
            .then(() => onGenerated());
        }
      });
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
        {/* Header — matches blog generate modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Generate Social Post</h2>
              <p className="text-[11px] text-gray-500">AI will create caption, hashtags, and image direction</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Brand */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">Brand</label>
            <div className="flex gap-2">
              {(["NI", "Sassy"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={clsx(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition",
                    brand === b
                      ? b === "NI" ? "bg-blue-100 text-blue-700 ring-2 ring-blue-200" : "bg-pink-100 text-pink-700 ring-2 ring-pink-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                  )}
                >
                  {b === "NI" ? "Natural Inspirations" : "Sassy"}
                </button>
              ))}
            </div>
          </div>

          {/* Active social promotion banner */}
          {socialPromos.length > 0 && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <Tag size={13} className="text-violet-600" />
                <span className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider">
                  Active Promotion{socialPromos.length > 1 ? "s" : ""} — will be referenced
                </span>
              </div>
              {socialPromos.map((p) => (
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

          {/* Content Type */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">Content Type</label>
            <div className="flex flex-wrap gap-1.5">
              {POST_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setPostType(t.value)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition",
                    postType === t.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              What should this post be about?
            </label>
            <textarea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              rows={3}
              placeholder="e.g. Mother's Day gift guide featuring our top 3 fragrances..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition resize-none"
            />
          </div>

          {/* Products */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Feature Products <span className="text-gray-400 normal-case tracking-normal">(optional — select which products to include)</span>
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
              <svg className={clsx("w-4 h-4 text-gray-400 transition", productsOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                    <div className={clsx(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition",
                      selectedProducts.includes(p.part) ? "bg-purple-600 border-purple-600" : "border-gray-300"
                    )}>
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
                  <span key={part} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[11px] font-medium">
                    {getProductLabel(part)}
                    <button onClick={() => toggleProduct(part)} className="hover:text-purple-900"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer — matches blog generate modal */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!direction.trim() || submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50"
          >
            <Sparkles size={14} />
            {submitting ? "Generating..." : "Generate Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
