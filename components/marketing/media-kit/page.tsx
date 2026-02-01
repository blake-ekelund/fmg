"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { MediaKitTable } from "./components/mediaKit/MediaKitTable";
import { ProductRow } from "./components/mediaKit/types";
import { SkuAssetEditorModal } from "./components/SkuAssetEditorModal";

import { Section, AssetMeta } from "./components/modalSections/types";
import { emptyAssetMeta } from "@/lib/mediaKit/emptyAssetMeta";

export default function MediaKitPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSku, setActiveSku] = useState<ProductRow | null>(null);

  const [assetMetaBySku, setAssetMetaBySku] = useState<
    Record<string, Record<Section, AssetMeta>>
  >({});

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("inventory_products")
      .select(`
        part,
        display_name,
        fragrance,
        media_kit_products (
          short_description,
          long_description,
          benefits,
          ingredients_text,
          updated_at
        )
      `)
      .order("part");

    if (error) {
      console.error("Failed to load products", error);
      setLoading(false);
      return;
    }

    const normalized: ProductRow[] =
      (data ?? []).map((row: any) => ({
        part: row.part,
        display_name: row.display_name,
        fragrance: row.fragrance,
        media_kit_products: row.media_kit_products ?? null,

      }));

    setProducts(normalized);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Initialize empty asset meta per SKU (prevents crashes)
  useEffect(() => {
    if (products.length === 0) return;

    const next: Record<string, Record<Section, AssetMeta>> = {};
    for (const p of products) {
      next[p.part] = emptyAssetMeta();
    }
    setAssetMetaBySku(next);
  }, [products]);

  // Load asset metadata for all SKUs
  useEffect(() => {
    if (products.length === 0) return;

    async function loadAssets() {
      const { data, error } = await supabase
        .from("media_kit_assets")
        .select("part, asset_type, updated_at");

      if (error) {
        console.error("Failed to load assets", error);
        return;
      }

      setAssetMetaBySku((prev) => {
        const next = { ...prev };
        for (const row of data ?? []) {
          if (!next[row.part]) continue;
          next[row.part][row.asset_type as Section] = {
            exists: true,
            updatedAt: row.updated_at,
          };
        }
        return next;
      });
    }

    loadAssets();
  }, [products]);

  return (
    <>
      <div className="space-y-6">

        <MediaKitTable
          products={products}
          loading={loading}
          assetMetaBySku={assetMetaBySku}
          onEdit={(p) => setActiveSku(p)}
        />
      </div>

      {activeSku && (
        <SkuAssetEditorModal
          open={true}
          part={activeSku.part}
          displayName={activeSku.display_name}
          fragrance={activeSku.fragrance ?? undefined}
          assets={assetMetaBySku[activeSku.part] ?? emptyAssetMeta()}
          onClose={() => setActiveSku(null)}
          onSaved={() => {
            load();               // 🔄 re-fetch marketing data
            setActiveSku(null);   // close modal (safety)
          }}
        />
      )}
    </>
  );
}
