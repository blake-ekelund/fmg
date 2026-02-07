"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type SalesMatrixRow = {
  month: string;
  productnum: string;
  display_name: string | null;
  fragrance: string | null;
  revenue: number;
};

const PAGE_SIZE = 1000;

function ym(year: number, jsMonth: number) {
  return `${year}-${String(jsMonth + 1).padStart(2, "0")}-01`;
}

export function useSalesTTM(
  search: string,
  endYear: number,
  endMonth: number // 1–12
) {
  const [rows, setRows] = useState<SalesMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const endJsMonth = endMonth - 1;
      const endAnchor = new Date(endYear, endJsMonth, 1);
      const startAnchor = new Date(
        endAnchor.getFullYear(),
        endAnchor.getMonth() - 11,
        1
      );

      const startMonth = ym(
        startAnchor.getFullYear(),
        startAnchor.getMonth()
      );

      const endMonthStr = ym(
        endAnchor.getFullYear(),
        endAnchor.getMonth()
      );

      let allRows: SalesMatrixRow[] = [];
      let page = 0;

      while (true) {
        let query = supabase
          .from("sales_by_product_month_enriched")
          .select(
            `
            month,
            productnum,
            display_name,
            fragrance,
            revenue
          `
          )
          .gte("month", startMonth)
          .lte("month", endMonthStr)
          .order("month", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (search) {
          query = query.or(
            `productnum.ilike.%${search}%,display_name.ilike.%${search}%,fragrance.ilike.%${search}%`
          );
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) break;

        allRows.push(
          ...data.map((r) => ({
            ...r,
            revenue: Number(r.revenue) || 0,
          }))
        );

        if (data.length < PAGE_SIZE) break;
        page += 1;
      }

      setRows(allRows);
      setLoading(false);
    }

    load();
  }, [search, endYear, endMonth]);

  return { rows, loading };
}
