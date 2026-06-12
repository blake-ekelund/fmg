"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";

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

/**
 * Loads the 12-month window of sales data for the given brand/end date.
 * Search filtering is deliberately NOT in this hook — it's applied client-side
 * so every keystroke doesn't refetch from the server.
 */
export function useSalesTTM(
  endYear: number,
  endMonth: number // 1–12
) {
  const { brand } = useBrand();
  const [rows, setRows] = useState<SalesMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

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

      const allRows: SalesMatrixRow[] = [];
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

        if (brand !== "all") {
          query = query.eq("brand", brand);
        }

        const { data, error } = await query;
        if (cancelled) return;
        if (error || !data || data.length === 0) break;

        allRows.push(
          ...data
            .filter((r) => {
              const pnum = (r.productnum || "").toUpperCase();
              const name = (r.display_name || "").toUpperCase();
              return (
                pnum !== "SUBTOTAL" && pnum !== "SHIPPING" &&
                name !== "SUBTOTAL" && name !== "SHIPPING"
              );
            })
            .map((r) => ({
              ...r,
              revenue: Number(r.revenue) || 0,
            }))
        );

        if (data.length < PAGE_SIZE) break;
        page += 1;
      }

      if (!cancelled) {
        setRows(allRows);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [endYear, endMonth, brand]);

  return { rows, loading };
}
