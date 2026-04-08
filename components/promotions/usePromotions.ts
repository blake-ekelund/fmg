"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Promotion } from "./types";

export function usePromotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (): Promise<Promotion[]> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("promotions")
      .select("*")
      .order("created_at", { ascending: false });

    const list = (!error && data ? data : []) as Promotion[];
    setPromotions(list);
    setLoading(false);
    return list;
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  async function save(promo: Partial<Promotion> & { id?: string }) {
    const payload = { ...promo, updated_at: new Date().toISOString() };

    if (promo.id) {
      const { error } = await supabase
        .from("promotions")
        .update(payload)
        .eq("id", promo.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("promotions")
        .insert(payload);
      if (error) throw error;
    }
    await fetch_();
  }

  async function remove(id: string) {
    await supabase.from("promotions").delete().eq("id", id);
    await fetch_();
  }

  async function duplicate(id: string) {
    const src = promotions.find((p) => p.id === id);
    if (!src) return;
    const { id: _, created_at, updated_at, current_uses, shopify_discount_id, shopify_synced, ...rest } = src;
    await supabase.from("promotions").insert({
      ...rest,
      name: `${src.name} (Copy)`,
      status: "draft",
      code: src.code ? `${src.code}-COPY` : null,
      current_uses: 0,
      shopify_discount_id: null,
      shopify_synced: false,
    });
    await fetch_();
  }

  return { promotions, loading, save, remove, duplicate, refresh: fetch_ };
}
