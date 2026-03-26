"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

type MonthlyRow = {
  month: string; // "Jan", "Feb", ...
  monthNum: number;
  wholesale_2025: number;
  wholesale_2026: number;
  d2c_2025: number;
  d2c_2026: number;
};

type KPIs = {
  wholesale_ytd_2026: number;
  wholesale_ytd_2025: number;
  wholesale_variance: number;
  d2c_ytd_2026: number;
  d2c_ytd_2025: number;
  d2c_variance: number;
  total_ytd_2026: number;
  total_ytd_2025: number;
  total_variance: number;
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function useDashboardSales(brand: BrandFilter) {
  const [data, setData] = useState<MonthlyRow[]>([]);
  const [kpis, setKpis] = useState<KPIs>({
    wholesale_ytd_2026: 0, wholesale_ytd_2025: 0, wholesale_variance: 0,
    d2c_ytd_2026: 0, d2c_ytd_2025: 0, d2c_variance: 0,
    total_ytd_2026: 0, total_ytd_2025: 0, total_variance: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const brandParam = brand === "all" ? null : brand;

      const { data: rows, error } = await supabase
        .rpc("dashboard_monthly_sales", { p_brand: brandParam });

      if (cancelled || error || !rows) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Build month grid (Jan–Dec)
      const grid: MonthlyRow[] = MONTH_LABELS.map((label, i) => ({
        month: label,
        monthNum: i + 1,
        wholesale_2025: 0,
        wholesale_2026: 0,
        d2c_2025: 0,
        d2c_2026: 0,
      }));

      // Current month for YTD comparison
      const currentMonth = new Date().getMonth() + 1; // 1-based

      let w_ytd_26 = 0, w_ytd_25 = 0;
      let d_ytd_26 = 0, d_ytd_25 = 0;

      for (const row of rows as { month: string; segment: string; revenue: string }[]) {
        // Parse "YYYY-MM-DD" directly to avoid UTC timezone shift
        const [yearStr, monthStr] = row.month.split("-");
        const year = Number(yearStr);
        const monthIdx = Number(monthStr) - 1; // 0-based
        const revenue = Number(row.revenue) || 0;

        if (year === 2025 && row.segment === "Wholesale") {
          grid[monthIdx].wholesale_2025 = revenue;
          if (monthIdx + 1 <= currentMonth) w_ytd_25 += revenue;
        } else if (year === 2026 && row.segment === "Wholesale") {
          grid[monthIdx].wholesale_2026 = revenue;
          if (monthIdx + 1 <= currentMonth) w_ytd_26 += revenue;
        } else if (year === 2025 && row.segment === "D2C") {
          grid[monthIdx].d2c_2025 = revenue;
          if (monthIdx + 1 <= currentMonth) d_ytd_25 += revenue;
        } else if (year === 2026 && row.segment === "D2C") {
          grid[monthIdx].d2c_2026 = revenue;
          if (monthIdx + 1 <= currentMonth) d_ytd_26 += revenue;
        }
      }

      setData(grid);
      setKpis({
        wholesale_ytd_2026: w_ytd_26,
        wholesale_ytd_2025: w_ytd_25,
        wholesale_variance: w_ytd_26 - w_ytd_25,
        d2c_ytd_2026: d_ytd_26,
        d2c_ytd_2025: d_ytd_25,
        d2c_variance: d_ytd_26 - d_ytd_25,
        total_ytd_2026: w_ytd_26 + d_ytd_26,
        total_ytd_2025: w_ytd_25 + d_ytd_25,
        total_variance: (w_ytd_26 + d_ytd_26) - (w_ytd_25 + d_ytd_25),
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [brand]);

  return { data, kpis, loading };
}
