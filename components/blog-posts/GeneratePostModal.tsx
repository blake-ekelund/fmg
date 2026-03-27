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
  display_name: string;
  brand: string;
};

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aXNqdWJ3ZXpoeGZ4b2NvYXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDcyNDMsImV4cCI6MjA4NDYyMzI0M30.F7-Yg5JVryMzueXtaOz8TIunbhC-QxUgJz89ZWKxO6Q";

export default function GeneratePostModal({ open, onClose, onGenerated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState<"NI" | "Sassy">("NI");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productsOpen, setProductsOpen] = useState(false);

  // Load product options
  useEffect(() => {
    if (!open) return;
    async function loadProducts() {
      const { data } = await supabase
        .from("inventory_products")
        .select("display_name, brand")
        .in("brand", ["NI", "Sassy"])
        .not("display_name", "ilike", "%TESTER%")
        .not("display_name", "ilike", "%Marketing%")
        .not("display_name", "ilike", "%Sample%")
        .order("display_name");

      if (data) {
        // Deduplicate by display_name + brand
        const seen = new Set<string>();
        const unique: ProductOption[] = [];
        for (const p of data) {
          const key = `${p.brand}:${p.display_name}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
          }
        }
        setProductOptions(unique);
      }
    }
    loadProducts();
  }, [open]);

  // Filter products by selected brand
  const filteredProducts = productOptions.filter(
    (p) => p.brand === brand || (brand === "NI" && p.brand === "NI") || (brand === "Sassy" && p.brand === "Sassy")
  );

  // Clear product selections when brand changes
  useEffect(() => {
    setSelectedProducts([]);
  }, [brand]);

  function toggleProduct(name: string) {
    setSelectedProducts((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  }

  if (!open) return null;

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) return;

    const submitTitle = title.trim();
    const submitDescription = description.trim();
    const submitBrand = brand;
    const submitProducts = selectedProducts;

    // 1. Insert placeholder row
    const { data: inserted } = await supabase
      .from("blog_posts")
      .insert({
        title: submitTitle,
        body: "<p>Generating...</p>",
        brand: submitBrand,
        status: "generating",
        seo_meta: null,
        tags: null,
        hero_image_url: "",
      })
      .select("id")
      .single();

    const rowId = inserted?.id;

    // Reset & close
    setTitle("");
    setDescription("");
    setSelectedProducts([]);
    onClose();
    onGenerated();

    // 2. Fire edge function with product preferences
    fetch("https://vxisjubwezhxfxocoawk.supabase.co/functions/v1/generate-blog-posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        mode: "single",
        brand: submitBrand,
        title: submitTitle,
        description: submitDescription,
        row_id: rowId,
        products: submitProducts.length > 0 ? submitProducts : undefined,
      }),
    })
      .then(() => onGenerated())
      .catch(() => {
        if (rowId) {
          supabase
            .from("blog_posts")
            .update({ status: "ai_draft", body: "<p>Generation failed. Please try again.</p>" })
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Generate with AI</h2>
              <p className="text-[11px] text-gray-500">Tell Claude what to write about</p>
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
          {/* Brand selector */}
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
                        ? "bg-blue-100 text-blue-700 ring-2 ring-blue-200"
                        : "bg-pink-100 text-pink-700 ring-2 ring-pink-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                  )}
                >
                  {b === "NI" ? "Natural Inspirations" : "Sassy"}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Post Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Science Behind Cold-Pressed Seed Oils"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              What should this post cover?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the angle, key points, or direction you want..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition resize-none"
            />
          </div>

          {/* Product selector */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Feature Products{" "}
              <span className="text-gray-400 normal-case tracking-normal">(optional — select which products to include)</span>
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
                    key={p.display_name}
                    onClick={() => toggleProduct(p.display_name)}
                    className={clsx(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition border-b border-gray-50 last:border-0",
                      selectedProducts.includes(p.display_name) && "bg-purple-50"
                    )}
                  >
                    <div
                      className={clsx(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition",
                        selectedProducts.includes(p.display_name)
                          ? "bg-purple-600 border-purple-600"
                          : "border-gray-300"
                      )}
                    >
                      {selectedProducts.includes(p.display_name) && (
                        <Check size={10} className="text-white" />
                      )}
                    </div>
                    <span className="text-gray-700">{p.display_name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Selected product chips */}
            {selectedProducts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedProducts.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[11px] font-medium"
                  >
                    {name}
                    <button
                      onClick={() => toggleProduct(name)}
                      className="hover:text-purple-900"
                    >
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
            disabled={!title.trim() || !description.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50"
          >
            <Sparkles size={14} />
            Generate Post
          </button>
        </div>
      </div>
    </div>
  );
}
