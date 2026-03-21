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
    brand: product?.brand ?? "NI",
    cogs: product?.cogs ?? 0,
    min_qty: product?.min_qty ?? 0,
    max_qty: product?.max_qty ?? 0,
    is_forecasted: product?.is_forecasted ?? true,
    lead_time_months: product?.lead_time_months ?? 0,
    avg_monthly_demand: product?.avg_monthly_demand ?? 0,
  });

  const [saving, setSaving] = useState(false);

  function update<K extends keyof Product>(k: K, v: Product[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.part || !form.display_name || !form.part_type) return;
    setSaving(true);

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
      <div className="relative w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl shadow-xl ring-1 ring-black/5 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold">
            {isEdit ? "Edit Product" : "Add Product"}
          </h3>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Product Details */}
          <section className="space-y-4">
            <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Product Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="SKU / Part #"
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

              <Select
                label="Brand"
                value={form.brand}
                options={["NI", "Sassy"]}
                onChange={(v) =>
                  update("brand", v as "NI" | "Sassy")
                }
              />

              <Input
                label="Part Type / Category"
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

              <NumberInput
                label="COGS ($)"
                value={form.cogs}
                onChange={(v) => update("cogs", v)}
              />
            </div>
          </section>

          {/* Inventory Rules */}
          <section className="space-y-4">
            <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Inventory Rules
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

              <NumberInput
                label="Lead Time (mo)"
                value={form.lead_time_months}
                onChange={(v) => update("lead_time_months", v)}
              />

              <NumberInput
                label="Avg Monthly Demand"
                value={form.avg_monthly_demand}
                onChange={(v) => update("avg_monthly_demand", v)}
              />
            </div>
          </section>

          {/* Forecast */}
          <section>
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_forecasted}
                onChange={(e) =>
                  update("is_forecasted", e.target.checked)
                }
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
              />
              Include in forecast
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
          >
            Cancel
          </button>

          <button
            onClick={save}
            disabled={saving || !form.part || !form.display_name}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Form Inputs ─── */

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
        className="w-full rounded-lg bg-white px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50 disabled:text-gray-400 transition"
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
        className="w-full rounded-lg bg-white px-3 py-2 text-sm text-right border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition tabular-nums"
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
        className="w-full rounded-lg bg-white px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
