"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type RecentAsset = {
  id: string;
  title: string;
  uploaded_at: string;
  type: "photo" | "media_kit";
  allow_third_party: boolean;
};

export type AssetKPIs = {
  total_photos: number;
  third_party_photos: number;
  media_kit_products: number;
  media_kit_assets: number;
};

export function useDashboardAssets(brand: BrandFilter) {
  const [recent, setRecent] = useState<RecentAsset[]>([]);
  const [kpis, setKpis] = useState<AssetKPIs>({
    total_photos: 0,
    third_party_photos: 0,
    media_kit_products: 0,
    media_kit_assets: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1. Photo share assets
      const { data: photos } = await supabase
        .from("photo_share_assets")
        .select("id, title, uploaded_at, allow_third_party_use")
        .eq("is_active", true)
        .order("uploaded_at", { ascending: false })
        .limit(50);

      // 2. Media kit assets count
      let mkQuery = supabase
        .from("media_kit_assets")
        .select("id, part, asset_type, created_at");

      const { data: mkAssets } = await mkQuery;

      // 3. Media kit products with content
      let mkpQuery = supabase
        .from("media_kit_products")
        .select("part");

      const { data: mkProducts } = await mkpQuery;

      if (cancelled) return;

      const photoList = photos ?? [];
      const mkList = mkAssets ?? [];
      const mkpList = mkProducts ?? [];

      // Build recent list (last 8 items combined)
      const recentPhotos: RecentAsset[] = photoList.slice(0, 6).map((p) => ({
        id: p.id,
        title: p.title,
        uploaded_at: p.uploaded_at,
        type: "photo" as const,
        allow_third_party: p.allow_third_party_use,
      }));

      const recentMK: RecentAsset[] = mkList.slice(0, 4).map((a) => ({
        id: a.id,
        title: `${a.part} — ${a.asset_type}`,
        uploaded_at: a.created_at,
        type: "media_kit" as const,
        allow_third_party: false,
      }));

      const combined = [...recentPhotos, ...recentMK]
        .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
        .slice(0, 8);

      setRecent(combined);
      setKpis({
        total_photos: photoList.length,
        third_party_photos: photoList.filter((p) => p.allow_third_party_use).length,
        media_kit_products: mkpList.length,
        media_kit_assets: mkList.length,
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [brand]);

  return { recent, kpis, loading };
}
