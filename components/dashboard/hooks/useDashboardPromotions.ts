"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type DashboardPromotion = {
  id: string;
  name: string;
  code: string | null;
  discount_type: string;
  discount_value: number | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  brand: string;
  channel: string;
  status: string;
  current_uses: number;
  max_uses: number | null;
  starts_at: string;
  ends_at: string | null;
  shopify_synced: boolean;
};

export type PromotionStats = {
  total: number;
  active: number;
  scheduled: number;
  expired: number;
  totalRedemptions: number;
};

export function useDashboardPromotions() {
  const [promotions, setPromotions] = useState<DashboardPromotion[]>([]);
  const [stats, setStats] = useState<PromotionStats>({
    total: 0,
    active: 0,
    scheduled: 0,
    expired: 0,
    totalRedemptions: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("promotions")
      .select("id, name, code, discount_type, discount_value, buy_quantity, get_quantity, brand, channel, status, current_uses, max_uses, starts_at, ends_at, shopify_synced")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const promos = data as DashboardPromotion[];
      setPromotions(promos);
      setStats({
        total: promos.length,
        active: promos.filter((p) => p.status === "active").length,
        scheduled: promos.filter((p) => p.status === "scheduled").length,
        expired: promos.filter((p) => p.status === "expired").length,
        totalRedemptions: promos.reduce((s, p) => s + p.current_uses, 0),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { promotions, stats, loading, refresh: fetch_ };
}
