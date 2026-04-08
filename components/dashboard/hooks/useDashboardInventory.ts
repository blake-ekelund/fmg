"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type InventoryStatus = "at_risk" | "review" | "healthy" | "no_demand";

export type DashboardInventoryItem = {
  part: string;
  display_name: string;
  brand: "NI" | "Sassy";
  part_type: string;
  on_hand: number;
  on_order: number;
  avg_monthly_demand: number;
  months_of_supply: number;
  status: InventoryStatus;
};

export type InventoryKPIs = {
  total_skus: number;
  at_risk: number;
  review: number;
  healthy: number;
  no_demand: number;
  total_on_hand: number;
  total_on_order: number;
};

function classifyStatus(
  onHand: number,
  onOrder: number,
  avgDemand: number
): { status: InventoryStatus; monthsOfSupply: number } {
  if (avgDemand <= 0) return { status: "no_demand", monthsOfSupply: Infinity };
  const months = (onHand + onOrder) / avgDemand;
  if (months < 1.5) return { status: "at_risk", monthsOfSupply: months };
  if (months < 3) return { status: "review", monthsOfSupply: months };
  return { status: "healthy", monthsOfSupply: months };
}

export function useDashboardInventory(brand: BrandFilter) {
  const [items, setItems] = useState<DashboardInventoryItem[]>([]);
  const [kpis, setKpis] = useState<InventoryKPIs>({
    total_skus: 0,
    at_risk: 0,
    review: 0,
    healthy: 0,
    no_demand: 0,
    total_on_hand: 0,
    total_on_order: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1. Forecasted products
      let productsQuery = supabase
        .from("inventory_products")
        .select("part, display_name, brand, part_type, avg_monthly_demand, is_forecasted")
        .eq("is_forecasted", true)
        .order("part");

      if (brand !== "all") {
        productsQuery = productsQuery.eq("brand", brand);
      }

      const { data: products } = await productsQuery;

      // 2. Latest inventory snapshot
      const { data: latestUpload } = await supabase
        .from("inventory_uploads")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let inventoryMap = new Map<string, { on_hand: number; on_order: number }>();

      if (latestUpload) {
        const { data: inventory } = await supabase
          .from("inventory_snapshot_items")
          .select("part, on_hand, on_order")
          .eq("upload_id", latestUpload.id);

        inventoryMap = new Map(
          (inventory ?? []).map((r) => [r.part, { on_hand: r.on_hand, on_order: r.on_order }])
        );
      }

      // 3. 90-day sales units for demand fallback
      const { data: units90 } = await supabase
        .from("units_by_product_last_90_days")
        .select("part, units_last_90_days");

      const units90Map = new Map<string, number>(
        (units90 as { part: string; units_last_90_days: number }[] | null)?.map((r) => [
          r.part,
          r.units_last_90_days,
        ]) ?? []
      );

      if (cancelled) return;

      // 4. Merge & classify
      const merged: DashboardInventoryItem[] = (products ?? []).map((p) => {
        const inv = inventoryMap.get(p.part);
        const onHand = inv?.on_hand ?? 0;
        const onOrder = inv?.on_order ?? 0;
        const units = units90Map.get(p.part) ?? 0;
        const avgDemand =
          p.avg_monthly_demand && p.avg_monthly_demand > 0
            ? p.avg_monthly_demand
            : units / 3;

        const { status, monthsOfSupply } = classifyStatus(onHand, onOrder, avgDemand);

        return {
          part: p.part,
          display_name: p.display_name,
          brand: p.brand,
          part_type: p.part_type,
          on_hand: onHand,
          on_order: onOrder,
          avg_monthly_demand: avgDemand,
          months_of_supply: monthsOfSupply,
          status,
        };
      });

      // 5. Compute KPIs
      const k: InventoryKPIs = {
        total_skus: merged.length,
        at_risk: merged.filter((r) => r.status === "at_risk").length,
        review: merged.filter((r) => r.status === "review").length,
        healthy: merged.filter((r) => r.status === "healthy").length,
        no_demand: merged.filter((r) => r.status === "no_demand").length,
        total_on_hand: merged.reduce((s, r) => s + r.on_hand, 0),
        total_on_order: merged.reduce((s, r) => s + r.on_order, 0),
      };

      setItems(merged);
      setKpis(k);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [brand]);

  return { items, kpis, loading };
}
