"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Product } from "../types";
import AddEditProductModal from "../AddEditProductModal";

export default function ProductListSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">
          Product List
        </h2>

        <button
          onClick={() => setAddOpen(true)}
          className="
            px-4 py-2 rounded-xl text-sm font-medium
            bg-orange-400 text-white
            hover:bg-orange-500 transition
          "
        >
          Add Product
        </button>
      </div>

      {/* Table Container */}
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
              <th className="px-4 py-3 text-left font-medium">
                Size
              </th>
              <th className="px-4 py-3 text-left font-medium">
                Type
              </th>
              <th className="px-4 py-3 text-left font-medium">
                Product Type
              </th>              
              <th className="px-4 py-3 text-right font-medium">
                Min
              </th>
              <th className="px-4 py-3 text-right font-medium">
                Max
              </th>
              <th className="px-4 py-3 text-center font-medium">
                Forecast
              </th>
              <th className="px-4 py-3 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
              products.map((p, idx) => (
                <tr
                  key={p.part}
                  onClick={() => setActiveProduct(p)}
                  className={`
                    cursor-pointer
                    transition
                    hover:bg-gray-50
                    ${idx !== products.length - 1 ? "border-b border-gray-100" : ""}
                  `}
                >
                  {/* Part # */}
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {p.part}
                  </td>

                  {/* Display Name */}
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {p.display_name}
                  </td>

                  {/* Fragrance */}
                  <td className="px-4 py-3 text-gray-600">
                    {p.fragrance ?? "—"}
                  </td>

                  {/* Size */}
                  <td className="px-4 py-3 text-gray-600">
                    {p.size ?? "—"}
                  </td>

                  {/* Part Type */}
                  <td className="px-4 py-3 text-gray-600">
                    {p.part_type}
                  </td>

                  {/* Product Type */}
                  <td className="px-4 py-3 text-gray-700">
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium">
                      {p.product_type}
                    </span>
                  </td>

                  {/* Min */}
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                    {p.min_qty}
                  </td>

                  {/* Max */}
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                    {p.max_qty}
                  </td>

                  {/* Forecast toggle */}
                  <td
                    className="px-4 py-3 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={p.is_forecasted}
                      onChange={(e) =>
                        toggleForecast(
                          p.part,
                          e.target.checked
                        )
                      }
                      className="h-4 w-4 accent-orange-500"
                    />
                  </td>

                  {/* Actions */}
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

        {!loading && products.length === 0 && (
          <div className="p-6 text-sm text-gray-500">
            No products configured yet.
          </div>
        )}

        {loading && (
          <div className="p-6 text-sm text-gray-500">
            Loading products…
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
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
