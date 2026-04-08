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

export type KPIs = {
  wholesale_ytd_2026: number;
  wholesale_ytd_2025: number;
  wholesale_variance: number;
  d2c_ytd_2026: number;
  d2c_ytd_2025: number;
  d2c_variance: number;
  total_ytd_2026: number;
  total_ytd_2025: number;
  total_variance: number;
  /** e.g. "through Apr 6" — for display context */
  ytd_label: string;
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
    ytd_label: "",
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
        if (error) console.error("useDashboardSales RPC error:", error);
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

      // ── Partial-month-aware YTD ──
      // For the current month, 2026 only has `dayOfMonth` days of data.
      // Pro-rate 2025's current month so the comparison is apples-to-apples.
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-based
      const dayOfMonth = now.getDate();
      const daysInCurrentMonth2025 = new Date(2025, currentMonth, 0).getDate(); // total days in that month last year
      const partialFraction = Math.min(dayOfMonth / daysInCurrentMonth2025, 1);

      let w_ytd_26 = 0, w_ytd_25 = 0;
      let d_ytd_26 = 0, d_ytd_25 = 0;

      for (const row of rows as { month: string; segment: string; revenue: string }[]) {
        // Parse "YYYY-MM-DD" directly to avoid UTC timezone shift
        const [yearStr, monthStr] = row.month.split("-");
        const year = Number(yearStr);
        const monthIdx = Number(monthStr) - 1; // 0-based
        const monthNum = monthIdx + 1; // 1-based
        const revenue = Number(row.revenue) || 0;

        // For YTD: include completed months fully, and pro-rate the
        // prior year's current month to match the elapsed days in 2026.
        const isCompletedMonth = monthNum < currentMonth;
        const isCurrentMonth = monthNum === currentMonth;

        if (year === 2025 && row.segment === "Wholesale") {
          grid[monthIdx].wholesale_2025 = revenue;
          if (isCompletedMonth) w_ytd_25 += revenue;
          else if (isCurrentMonth) w_ytd_25 += revenue * partialFraction;
        } else if (year === 2026 && row.segment === "Wholesale") {
          grid[monthIdx].wholesale_2026 = revenue;
          if (isCompletedMonth || isCurrentMonth) w_ytd_26 += revenue;
        } else if (year === 2025 && row.segment === "D2C") {
          grid[monthIdx].d2c_2025 = revenue;
          if (isCompletedMonth) d_ytd_25 += revenue;
          else if (isCurrentMonth) d_ytd_25 += revenue * partialFraction;
        } else if (year === 2026 && row.segment === "D2C") {
          grid[monthIdx].d2c_2026 = revenue;
          if (isCompletedMonth || isCurrentMonth) d_ytd_26 += revenue;
        }
      }

      // Build a readable label like "through Apr 6"
      const ytdLabel = `through ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

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
        ytd_label: ytdLabel,
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [brand]);

  return { data, kpis, loading };
}
