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

    // ✅ REQUIRED BY TYPE — intentionally not editable here
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
        >
          <X size={18} />
        </button>

        <h3 className="text-lg font-medium">
          {isEdit ? "Edit Product" : "Add Product"}
        </h3>

        <div className="grid grid-cols-2 gap-4">
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
            label="Fragrance"
            value={form.fragrance ?? ""}
            onChange={(v) => update("fragrance", v)}
          />

          <Input
            label="Size"
            value={form.size ?? ""}
            onChange={(v) => update("size", v)}
          />

          <Input
            label="Type"
            value={form.part_type}
            onChange={(v) => update("part_type", v)}
          />

          <NumberInput
            label="Min"
            value={form.min_qty}
            onChange={(v) => update("min_qty", v)}
          />

          <NumberInput
            label="Max"
            value={form.max_qty}
            onChange={(v) => update("max_qty", v)}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_forecasted}
            onChange={(e) =>
              update("is_forecasted", e.target.checked)
            }
          />
          <span className="text-sm text-gray-700">
            Include in forecast
          </span>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="text-sm text-gray-600">
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-400 text-white"
          >
            {isEdit ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Inputs ---------- */

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
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border px-3 py-2 disabled:bg-gray-100"
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
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl border px-3 py-2 text-right"
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
    <div>
      <label className="text-sm font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border px-3 py-2"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
