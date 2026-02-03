"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X } from "lucide-react";
import { Product } from "./types";

export default function AddEditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(product);

  const [form, setForm] = useState<Product>({
    part: product?.part ?? "",
    display_name: product?.display_name ?? "",
    product_type: product?.product_type ?? "FG",
    fragrance: product?.fragrance ?? "",
    size: product?.size ?? "",
    part_type: product?.part_type ?? "",
    cogs: product?.cogs ?? 0,
    min_qty: product?.min_qty ?? 0,
    max_qty: product?.max_qty ?? 0,
    is_forecasted: product?.is_forecasted ?? true,
    lead_time_months: product?.lead_time_months ?? 0,
    avg_monthly_demand: product?.avg_monthly_demand ?? 0,
  });

  function update<K extends keyof Product>(k: K, v: Product[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.part || !form.display_name || !form.part_type) return;

    if (isEdit) {
      await supabase
        .from("inventory_products")
        .update(form)
        .eq("part", product!.part);
    } else {
      await supabase.from("inventory_products").insert(form);
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
        <div
          className="
            relative w-full md:max-w-2xl
            bg-white
            rounded-t-2xl md:rounded-2xl
            shadow-xl
            ring-1 ring-black/5
            max-h-[90vh]
            flex flex-col
            overflow-hidden
          "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-lg font-medium">
            {isEdit ? "Edit Product" : "Add Product"}
          </h3>

          <button
            onClick={onClose}
            className="
              p-2 rounded-lg
              text-gray-400
              hover:text-gray-700
              hover:bg-gray-100/60
              transition
            "
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-8">
          {/* Product Details */}
          <section className="space-y-4">
            <h4 className="text-sm font-medium text-gray-500">
              Product Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Part #"
                value={form.part}
                disabled={isEdit}
                onChange={(v) => update("part", v)}
              />

              <Input
                label="Display Name"
                value={form.display_name}
                onChange={(v) => update("display_name", v)}
              />

              <Select
                label="Product Type"
                value={form.product_type}
                options={["FG", "BOM"]}
                onChange={(v) =>
                  update("product_type", v as "FG" | "BOM")
                }
              />

              <Input
                label="Part Type"
                value={form.part_type}
                onChange={(v) => update("part_type", v)}
              />

              <Input
                label="Fragrance"
                value={form.fragrance ?? ""}
                onChange={(v) => update("fragrance", v)}
              />

              <Input
                label="Size"
                value={form.size ?? ""}
                onChange={(v) => update("size", v)}
              />
            </div>
          </section>

          {/* Inventory Rules */}
          <section className="space-y-4">
            <h4 className="text-sm font-medium text-gray-500">
              Inventory Rules
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Min Qty"
                value={form.min_qty}
                onChange={(v) => update("min_qty", v)}
              />

              <NumberInput
                label="Max Qty"
                value={form.max_qty}
                onChange={(v) => update("max_qty", v)}
              />
            </div>
          </section>

          {/* Forecast */}
          <section>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.is_forecasted}
                onChange={(e) =>
                  update("is_forecasted", e.target.checked)
                }
                className="h-4 w-4 accent-orange-500"
              />
              Include in forecast
            </label>
          </section>
        </div>

        {/* Footer */}
        <div
          className="
            flex items-center justify-end gap-3
            px-5 py-4
            bg-white/80
            backdrop-blur
          "
        >
          <button
            onClick={onClose}
            className="text-sm text-gray-600"
          >
            Cancel
          </button>

          <button
            onClick={save}
            className="
              px-5 py-2.5 rounded-xl
              text-sm font-medium
              bg-orange-400 text-white
              hover:bg-orange-500
              shadow-sm
            "
          >
            {isEdit ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Soft Inputs ---------- */

function Input({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="
          w-full rounded-xl
          bg-gray-50
          px-3 py-2
          text-sm
          ring-1 ring-gray-200
          focus:ring-2 focus:ring-orange-400
          focus:bg-white
          disabled:bg-gray-100
          transition
        "
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="
          w-full rounded-xl
          bg-gray-50
          px-3 py-2
          text-sm text-right
          ring-1 ring-gray-200
          focus:ring-2 focus:ring-orange-400
          focus:bg-white
          transition
        "
      />
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="
          w-full rounded-xl
          bg-gray-50
          px-3 py-2
          text-sm
          ring-1 ring-gray-200
          focus:ring-2 focus:ring-orange-400
          focus:bg-white
          transition
        "
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
