"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { Brand } from "@/types/brand";

type Props = {
  open: boolean;
  defaultBrand: Brand;
  onClose: () => void;
  onCreated?: () => void;
};

export default function CreateProductModal({
  open,
  defaultBrand,
  onClose,
  onCreated,
}: Props) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [brand, setBrand] = useState<Brand>(defaultBrand);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setSku("");
    setDisplayName("");
    setBrand(defaultBrand);
    setSaving(false);
    setError(null);
  }, [open, defaultBrand]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canSubmit =
    sku.trim().length > 0 && displayName.trim().length > 0 && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    const trimmedSku = sku.trim();
    const { error: insertError } = await supabase
      .from("inventory_products")
      .insert({
        part: trimmedSku,
        display_name: displayName.trim(),
        product_type: "FG",
        fragrance: "",
        size: "",
        part_type: "FG",
        brand,
        cogs: 0,
        min_qty: 0,
        max_qty: 0,
        is_forecasted: true,
        lead_time_months: 0,
        avg_monthly_demand: 0,
      });

    if (insertError) {
      // 23505 = unique constraint violation (duplicate SKU)
      if (insertError.code === "23505") {
        setError(`SKU "${trimmedSku}" already exists. Pick a different one.`);
      } else {
        setError(insertError.message || "Couldn't create the product.");
      }
      setSaving(false);
      return;
    }

    onCreated?.();
    onClose();
    router.push(`/products/${encodeURIComponent(trimmedSku)}`);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New product</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              SKU
            </label>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. NI-LOTION-8OZ-LAV"
              autoFocus
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 font-mono"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Unique product identifier. Used everywhere — pick carefully.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Display name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Lavender Lotion 8oz"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Brand
            </label>
            <div className="flex gap-2">
              {(["NI", "Sassy"] as Brand[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrand(b)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                    (brand === b
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")
                  }
                >
                  {b}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Other details (fragrance, size, COGS, etc.) can be filled in on
              the product page after create.
            </p>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? "Creating…" : "Create product"}
          </button>
        </div>
      </div>
    </div>
  );
}
