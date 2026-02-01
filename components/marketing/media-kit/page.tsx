"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { MediaKitHeader } from "./components/mediaKit/MediaKitHeader";
import { MediaKitTable } from "./components/mediaKit/MediaKitTable";
import { ProductRow } from "./components/mediaKit/types";
import { SkuAssetEditorModal } from "./components/SkuAssetEditorModal";
import { Section, AssetMeta } from "./components/modalSections/types";

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
      console.error("Failed to load inventory_products", error);
    }

    setProducts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  /**
   * TEMP asset metadata stub
   * This is what drives:
   * - checkmarks
   * - last-updated dates in the modal nav
   *
   * Replace this with real media_kit_assets data later.
   */
  const assetStub: Record<Section, AssetMeta> = {
    description: {
      exists: true,
      updatedAt: activeSku?.updated_at ?? undefined,
    },
    front: {
      exists: false,
    },
    benefits: {
      exists: false,
    },
    lifestyle: {
      exists: true,
      updatedAt: "2026-01-28T14:02:00Z",
    },
    ingredients: {
      exists: true,
      updatedAt: "2026-01-27T09:41:00Z",
    },
    fragrance: {
      exists: true,
      updatedAt: "2026-01-26T16:20:00Z",
    },
    other: {
      exists: false,
    },
    notes: {
      exists: false,
    },
  };

  return (
    <>
      <div className="space-y-6">
        <MediaKitHeader />

        <MediaKitTable
          products={products}
          loading={loading}
          onEdit={setActiveSku}
        />
      </div>

      {activeSku && (
        <SkuAssetEditorModal
          open={true}
          part={activeSku.part}
          displayName={activeSku.display_name}
          fragrance={activeSku.fragrance ?? undefined}
          assets={assetStub}
          onClose={() => setActiveSku(null)}
        />
      )}
    </>
  );
}
