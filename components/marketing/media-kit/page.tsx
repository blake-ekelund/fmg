"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { MediaKitTable } from "./components/mediaKit/MediaKitTable";
import { FiltersBar } from "./components/mediaKit/FiltersBar";
import { ProductRow } from "./components/mediaKit/types";
import { SkuAssetEditorModal } from "./components/SkuAssetEditorModal";

import { Section, AssetMeta } from "./components/modalSections/types";
import { emptyAssetMeta } from "@/lib/mediaKit/emptyAssetMeta";

/* -------------------------
   Helper functions
-------------------------- */

function hasAnyCopy(p: ProductRow) {
  const c = p.media_kit_products;
  if (!c) return false;

  return !!(
    c.short_description?.trim() ||
    c.long_description?.trim() ||
    c.benefits?.trim() ||
    c.ingredients_text?.trim()
  );
}

function hasAllAssets(assetMeta: Record<Section, AssetMeta>) {
  return Object.values(assetMeta).every((a) => a.exists);
}

export default function MediaKitPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSku, setActiveSku] = useState<ProductRow | null>(null);

  const [assetMetaBySku, setAssetMetaBySku] = useState<
    Record<string, Record<Section, AssetMeta>>
  >({});

  /* ---------- filters ---------- */
  const [search, setSearch] = useState("");
  const [showMissingCopy, setShowMissingCopy] = useState(false);
  const [showMissingAssets, setShowMissingAssets] = useState(false);

  /* -------------------------
     Load products
  -------------------------- */
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

  /* -------------------------
     Initialize asset meta
  -------------------------- */
  useEffect(() => {
    if (products.length === 0) return;

    const next: Record<string, Record<Section, AssetMeta>> = {};
    for (const p of products) {
      next[p.part] = emptyAssetMeta();
    }
    setAssetMetaBySku(next);
  }, [products]);

  /* -------------------------
     Load asset metadata
  -------------------------- */
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

  /* -------------------------
     Apply filters (derived)
  -------------------------- */
  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();

    const matchesSearch =
      !search ||
      p.part.toLowerCase().includes(q) ||
      p.display_name.toLowerCase().includes(q) ||
      (p.fragrance ?? "").toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (showMissingCopy && hasAnyCopy(p)) return false;

    if (
      showMissingAssets &&
      hasAllAssets(assetMetaBySku[p.part] ?? emptyAssetMeta())
    ) {
      return false;
    }

    return true;
  });

  return (
    <>
      <div className="space-y-6">
        {/* Filters */}
        <div className="overflow-x-auto">
          <FiltersBar
            search={search}
            onSearchChange={setSearch}
            showMissingCopy={showMissingCopy}
            onToggleMissingCopy={setShowMissingCopy}
            showMissingAssets={showMissingAssets}
            onToggleMissingAssets={setShowMissingAssets}
            resultCount={filteredProducts.length}
          />
        </div>

        {/* Table */}
        <section className="overflow-x-auto">
          <MediaKitTable
            products={filteredProducts}
            loading={loading}
            assetMetaBySku={assetMetaBySku}
            onEdit={(p) => setActiveSku(p)}
          />
        </section>
      </div>

      {/* Editor Modal */}
      {activeSku && (
        <SkuAssetEditorModal
          open={true}
          part={activeSku.part}
          displayName={activeSku.display_name}
          fragrance={activeSku.fragrance ?? undefined}
          assets={assetMetaBySku[activeSku.part] ?? emptyAssetMeta()}
          onClose={() => setActiveSku(null)}
          onSaved={() => {
            load();
            setActiveSku(null);
          }}
        />
      )}
    </>
  );
}
