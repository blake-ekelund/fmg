"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Check } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

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

const PLATFORMS = ["Instagram", "Facebook", "TikTok"] as const;
const POST_TYPES = [
  { value: "carousel", label: "Carousel" },
  { value: "photo", label: "Photo Post" },
  { value: "reel", label: "Reel" },
  { value: "story", label: "Story" },
] as const;

export default function GenerateSocialPostModal({ open, onClose, onGenerated }: Props) {
  const [brand, setBrand] = useState<"NI" | "Sassy">("NI");
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>("Instagram");
  const [postType, setPostType] = useState("carousel");
  const [direction, setDirection] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productsOpen, setProductsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    load();
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

  if (!open) return null;

  async function handleSubmit() {
    if (!direction.trim() || submitting) return;
    setSubmitting(true);

    const submitDirection = direction.trim();
    const submitBrand = brand;
    const submitPlatform = platform;
    const submitPostType = postType;
    const submitProducts = selectedProducts
      .map((part) => productOptions.find((p) => p.part === part))
      .filter(Boolean)
      .map((p) => p!.display_name);

    // Insert placeholder
    const { data: inserted } = await supabase
      .from("social_media_posts")
      .insert({
        brand: submitBrand,
        platform: submitPlatform,
        post_type: submitPostType,
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
        platform: submitPlatform,
        post_type: submitPostType,
        direction: submitDirection,
        row_id: rowId,
        products: submitProducts.length > 0 ? submitProducts : undefined,
      }),
    })
      .then(() => onGenerated())
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-100 flex items-center justify-center">
              <Sparkles size={16} className="text-fuchsia-600" />
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

          {/* Platform + Post Type side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">Platform</label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition",
                      platform === p ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
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
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200 focus:border-fuchsia-300 transition resize-none"
            />
          </div>

          {/* Products */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Feature Products <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
            </label>
            <button
              onClick={() => setProductsOpen(!productsOpen)}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition"
            >
              <span className={selectedProducts.length ? "text-gray-900" : "text-gray-400"}>
                {selectedProducts.length ? `${selectedProducts.length} selected` : "Select products..."}
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
                      selectedProducts.includes(p.part) && "bg-fuchsia-50"
                    )}
                  >
                    <div className={clsx(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition",
                      selectedProducts.includes(p.part) ? "bg-fuchsia-600 border-fuchsia-600" : "border-gray-300"
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
                  <span key={part} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 text-[11px] font-medium">
                    {getProductLabel(part)}
                    <button onClick={() => toggleProduct(part)} className="hover:text-fuchsia-900"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!direction.trim() || submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium text-white bg-fuchsia-600 hover:bg-fuchsia-700 transition disabled:opacity-50"
          >
            <Sparkles size={14} />
            {submitting ? "Generating..." : "Generate Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
