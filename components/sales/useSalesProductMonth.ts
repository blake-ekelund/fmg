"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/* ---------------- Types ---------------- */

export type SalesProductMonth = {
  month: string; // YYYY-MM-01
  product_code: string;
  display_name: string | null;
  fragrance: string | null;
  units_sold: number;
  revenue: number;
};

/* ---------------- Hook ---------------- */

export function useSalesProductMonth() {
  const [rows, setRows] = useState<SalesProductMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("sales_by_product_month")
        .select("*")
        .order("month", { ascending: true })
        .returns<SalesProductMonth[]>();

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      setRows(
        (data ?? []).map((r) => ({
          ...r,
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
