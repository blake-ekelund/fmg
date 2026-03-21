"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Product } from "../types";
import type { BrandFilter } from "@/types/brand";

type StatusFilter = "current" | "archived" | "all";

interface UseProductsOptions {
  brand?: BrandFilter;
  search?: string;
  status?: StatusFilter;
}

export function useProducts(opts: UseProductsOptions = {}) {
  const { brand = "all", search = "", status = "all" } = opts;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("inventory_products")
      .select("*")
      .order("part");

    // Brand filter
    if (brand !== "all") {
      query = query.eq("brand", brand);
    }

    // Status filter (based on is_forecasted)
    if (status === "current") {
      query = query.eq("is_forecasted", true);
    } else if (status === "archived") {
      query = query.eq("is_forecasted", false);
    }

    // Search filter — applied via ilike on part, display_name, fragrance
    if (search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(
        `part.ilike.${q},display_name.ilike.${q},fragrance.ilike.${q}`
      );
    }

    const { data, error: err } = await query;

    if (err) {
      console.error("Failed to load products", err);
      setError(err.message);
      setLoading(false);
      return;
    }

    setProducts(data ?? []);
    setLoading(false);
  }, [brand, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  return { products, loading, error, reload: load };
}
