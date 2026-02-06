"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Product } from "../types";
import AddEditProductModal from "../AddEditProductModal";

type StatusFilter = "current" | "archived" | "all";

export default function ProductListSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ---------------- Filters ---------------- */

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("current");

  /* ---------------- Data ---------------- */

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("inventory_products")
      .select("*")
      .order("part");

    setProducts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleForecast(part: string, value: boolean) {
    setProducts((prev) =>
      prev.map((p) =>
        p.part === part ? { ...p, is_forecasted: value } : p
      )
    );

    await supabase
      .from("inventory_products")
      .update({ is_forecasted: value })
      .eq("part", part);
  }

  /* ---------------- Filtering Logic ---------------- */

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();

    return products.filter((p) => {
      // Status filter
      if (status === "current" && !p.is_forecasted) return false;
      if (status === "archived" && p.is_forecasted) return false;

      // Text search
      if (!q) return true;

      return (
        p.part.toLowerCase().includes(q) ||
        p.display_name?.toLowerCase().includes(q) ||
        p.fragrance?.toLowerCase().includes(q)
      );
    });
  }, [products, query, status]);

  /* ---------------- Table ---------------- */

  function ProductTable({
    rows,
    emptyLabel,
  }: {
    rows: Product[];
    emptyLabel: string;
  }) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-medium">Part #</th>
              <th className="px-4 py-3 text-left font-medium">
                Display Name
              </th>
              <th className="px-4 py-3 text-left font-medium">
                Fragrance
              </th>
              <th className="px-4 py-3 text-left font-medium">Size</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">
                Product Type
              </th>
              <th className="px-4 py-3 text-right font-medium">Min</th>
              <th className="px-4 py-3 text-right font-medium">Max</th>
              <th className="px-4 py-3 text-center font-medium">
                Forecast
              </th>
              <th className="px-4 py-3 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((p, idx) => (
              <tr
                key={p.part}
                onClick={() => setActiveProduct(p)}
                className={`
                  cursor-pointer transition hover:bg-gray-50
                  ${idx !== rows.length - 1 ? "border-b border-gray-100" : ""}
                `}
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-700">
                  {p.part}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {p.display_name}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {p.fragrance ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {p.size ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {p.part_type}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium">
                    {p.product_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {p.min_qty}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {p.max_qty}
                </td>
                <td
                  className="px-4 py-3 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={p.is_forecasted}
                    onChange={(e) =>
                      toggleForecast(p.part, e.target.checked)
                    }
                    className="h-4 w-4 accent-orange-500"
                  />
                </td>
                <td
                  className="px-4 py-3 text-right"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveProduct(p);
                  }}
                >
                  <button className="text-sm font-medium text-orange-600 hover:text-orange-700">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-gray-500">
            {emptyLabel}
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Render ---------------- */

return (
  <div className="space-y-6">
    {/* Toolbar */}
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by part, name, fragrance…"
        className="
          w-full md:w-80 rounded-xl border border-gray-200
          px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-orange-400
        "
      />

      {/* Status Filter */}
      <select
        value={status}
        onChange={(e) =>
          setStatus(e.target.value as StatusFilter)
        }
        className="
          rounded-xl border border-gray-200
          px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-orange-400
        "
      >
        <option value="current">Current</option>
        <option value="archived">Archived</option>
        <option value="all">All</option>
      </select>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Add Product */}
      <button
        onClick={() => setAddOpen(true)}
        className="
          px-4 py-2 rounded-xl text-sm font-medium
          bg-orange-400 text-white
          hover:bg-orange-500 transition
          whitespace-nowrap
        "
      >
        Add Product
      </button>
    </div>

    {/* Table */}
    <ProductTable
      rows={filteredProducts}
      emptyLabel="No matching products."
    />

    {/* Modal */}
    {(addOpen || activeProduct) && (
      <AddEditProductModal
        product={activeProduct}
        onClose={() => {
          setAddOpen(false);
          setActiveProduct(null);
        }}
        onSaved={load}
      />
    )}
  </div>
);

}
