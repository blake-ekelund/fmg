"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ImageIcon,
  FileTextIcon,
  AlertCircle,
  CheckCircle,
  Pencil,
  Copy,
} from "lucide-react";

import { SkuAssetEditorModal } from "./components/SkuAssetEditorModal";

/* =========================
   Types
========================= */

type ProductRow = {
  part: string;
  display_name: string;
  fragrance: string | null;
  updated_at?: string | null;
};

type Section =
  | "product"
  | "front"
  | "benefits"
  | "lifestyle"
  | "ingredients"
  | "fragrance"
  | "other"
  | "notes";

type AssetMeta = {
  exists: boolean;
  updatedAt?: string;
};

/* =========================
   Page
========================= */

export default function MediaKitPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSku, setActiveSku] = useState<ProductRow | null>(null);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("inventory_products")
      .select("part, display_name, fragrance, updated_at")
      .order("part");

    if (error) {
      console.error("Failed to load products", error);
    }

    setProducts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  /* -------------------------
     TEMP asset metadata
     (replace with real data later)
  -------------------------- */
  function getAssetMeta(): Record<Section, AssetMeta> {
    return {
      product: { exists: true },
      front: { exists: false },
      benefits: { exists: false },
      lifestyle: { exists: true, updatedAt: "2026-01-30" },
      ingredients: { exists: true, updatedAt: "2026-01-30" },
      fragrance: { exists: true, updatedAt: "2026-01-30" },
      other: { exists: false },
      notes: { exists: false },
    };
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <header>
          <h1 className="text-2xl font-semibold">Product Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Canonical product copy and retailer-ready assets.
          </p>
        </header>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <Th>SKU</Th>
                <Th>Description</Th>
                <Th>Assets</Th>
                <Th>Notes</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                products.map((p, idx) => (
                  <tr
                    key={p.part}
                    className={`transition hover:bg-gray-50 ${
                      idx !== products.length - 1
                        ? "border-b border-gray-100"
                        : ""
                    }`}
                  >
                    {/* SKU identity */}
                    <Td>
                      <div className="space-y-0.5">
                        <div className="font-mono text-xs text-gray-600">
                          {p.part}
                        </div>
                        <div className="font-medium text-gray-900">
                          {p.display_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {p.fragrance ?? "—"}
                        </div>
                      </div>
                    </Td>

                    {/* Description */}
                    <Td>
                      <div className="text-gray-500 text-sm">
                        No description provided
                      </div>
                    </Td>

                    {/* Assets */}
                    <Td>
                      <div className="grid grid-cols-3 gap-2 min-w-[220px]">
                        <AssetBadge label="Front" present={false} />
                        <AssetBadge label="Benefits" present={false} />
                        <AssetBadge label="Lifestyle" present />
                        <AssetBadge label="Ingredients" present />
                        <AssetBadge label="Fragrance" present />
                        <AssetBadge label="Other" present={false} />
                      </div>
                    </Td>

                    {/* Notes */}
                    <Td className="text-xs text-gray-500">—</Td>

                    {/* Updated */}
                    <Td className="text-xs text-gray-500 whitespace-nowrap">
                      {p.updated_at
                        ? new Date(p.updated_at).toLocaleDateString()
                        : "—"}
                    </Td>

                    {/* Actions */}
                    <Td className="text-right">
                      <button
                        onClick={() => setActiveSku(p)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!loading && products.length === 0 && (
            <div className="p-6 text-sm text-gray-500">
              No products found.
            </div>
          )}

          {loading && (
            <div className="p-6 text-sm text-gray-500">
              Loading products…
            </div>
          )}
        </div>
      </div>

      {/* SKU Asset Editor */}
      {activeSku && (
        <SkuAssetEditorModal
          open={true}
          part={activeSku.part}
          displayName={activeSku.display_name}
          fragrance={activeSku.fragrance ?? undefined}
          assets={getAssetMeta()}
          onClose={() => setActiveSku(null)}
        />
      )}
    </>
  );
}

/* =========================
   Asset Badge
========================= */

function AssetBadge({
  label,
  present,
}: {
  label: string;
  present?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-1 px-2 py-1 rounded-md border text-xs ${
        present ? "bg-white" : "bg-gray-100 text-gray-400"
      }`}
    >
      <span className="flex items-center gap-1">
        <ImageIcon size={12} />
        {label}
      </span>

      {present ? (
        <CheckCircle size={12} className="text-green-600" />
      ) : (
        <AlertCircle size={12} />
      )}
    </div>
  );
}

/* =========================
   Table Primitives
========================= */

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 align-top ${className}`}>
      {children}
    </td>
  );
}
