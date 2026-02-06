"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type SalesProductMonth = {
  month: string; // YYYY-MM-01
  product_code: string;
  display_name: string | null;
  fragrance: string | null;
  units_sold: number;
  revenue: number;
};

export function useSalesProductMonth() {
  const [rows, setRows] = useState<SalesProductMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("sales_by_product_month")
        .select("*")
        .order("month", { ascending: true });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      setRows(
        (data ?? []).map((r: any) => ({
          month: r.month,
          product_code: r.product_code,
          display_name: r.display_name,
          fragrance: r.fragrance,
          units_sold: Number(r.units_sold ?? 0),
          revenue: Number(r.revenue ?? 0),
        }))
      );

      setLoading(false);
    }

    load();
  }, []);

  return { rows, loading };
}
