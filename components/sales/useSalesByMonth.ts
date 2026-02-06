"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type SalesByMonth = {
  month: string; // YYYY-MM-01
  revenue: number;
  units_sold: number;
};

export function useSalesByMonth() {
  const [rows, setRows] = useState<SalesByMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("sales_by_month")
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
          revenue: Number(r.revenue ?? 0),
          units_sold: Number(r.units_sold ?? 0),
        }))
      );

      setLoading(false);
    }

    load();
  }, []);

  return { rows, loading };
}
