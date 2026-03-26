"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type HealthRow = {
  month: string; // "Apr '25"
  new_customers: number;
  newly_at_risk: number;
  newly_churned: number;
  reactivated_from_churned: number;
  reactivated_from_at_risk: number;
  reorders: number;
};

export type HealthKPIs = {
  new_ttm: number;
  at_risk_ttm: number;
  churned_ttm: number;
  reactivated_churned_ttm: number;
  reactivated_at_risk_ttm: number;
  reorders_ttm: number;
  // Latest month values
  new_latest: number;
  at_risk_latest: number;
  churned_latest: number;
  reactivated_churned_latest: number;
  reactivated_at_risk_latest: number;
  reorders_latest: number;
};

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function useDashboardCustomerHealth(brand: BrandFilter) {
  const [data, setData] = useState<HealthRow[]>([]);
  const [kpis, setKpis] = useState<HealthKPIs>({
    new_ttm: 0, at_risk_ttm: 0, churned_ttm: 0,
    reactivated_churned_ttm: 0, reactivated_at_risk_ttm: 0, reorders_ttm: 0,
    new_latest: 0, at_risk_latest: 0, churned_latest: 0,
    reactivated_churned_latest: 0, reactivated_at_risk_latest: 0, reorders_latest: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const brandParam = brand === "all" ? null : brand;

      const { data: rows, error } = await supabase
        .rpc("dashboard_customer_health_v2", { p_brand: brandParam });

      if (cancelled || error || !rows) {
        if (!cancelled) setLoading(false);
        return;
      }

      type RawRow = {
        month: string;
        new_customers: number;
        newly_at_risk: number;
        newly_churned: number;
        reactivated_from_churned: number;
        reactivated_from_at_risk: number;
        reorders: number;
      };

      const formatted: HealthRow[] = (rows as RawRow[]).map((r) => {
        // Parse "YYYY-MM-DD" directly to avoid UTC timezone shift
        const [yearStr, monthStr] = r.month.split("-");
        const monthIdx = Number(monthStr) - 1; // 0-based
        const label = `${SHORT_MONTHS[monthIdx]} '${yearStr.slice(2)}`;
        return {
          month: label,
          new_customers: Number(r.new_customers) || 0,
          newly_at_risk: Number(r.newly_at_risk) || 0,
          newly_churned: Number(r.newly_churned) || 0,
          reactivated_from_churned: Number(r.reactivated_from_churned) || 0,
          reactivated_from_at_risk: Number(r.reactivated_from_at_risk) || 0,
          reorders: Number(r.reorders) || 0,
        };
      });

      setData(formatted);

      const sum = (key: keyof HealthRow) =>
        formatted.reduce((s, r) => s + (Number(r[key]) || 0), 0);

      const latest = formatted[formatted.length - 1];

      setKpis({
        new_ttm: sum("new_customers"),
        at_risk_ttm: sum("newly_at_risk"),
        churned_ttm: sum("newly_churned"),
        reactivated_churned_ttm: sum("reactivated_from_churned"),
        reactivated_at_risk_ttm: sum("reactivated_from_at_risk"),
        reorders_ttm: sum("reorders"),
        new_latest: latest?.new_customers ?? 0,
        at_risk_latest: latest?.newly_at_risk ?? 0,
        churned_latest: latest?.newly_churned ?? 0,
        reactivated_churned_latest: latest?.reactivated_from_churned ?? 0,
        reactivated_at_risk_latest: latest?.reactivated_from_at_risk ?? 0,
        reorders_latest: latest?.reorders ?? 0,
      });

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [brand]);

  return { data, kpis, loading };
}
