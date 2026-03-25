"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

type HealthRow = {
  month: string; // "Apr '25", "May '25" ...
  new_customers: number;
  at_risk: number;
  churned: number;
};

type HealthKPIs = {
  new_ttm: number;
  at_risk_current: number;
  churned_current: number;
};

export function useDashboardCustomerHealth(brand: BrandFilter) {
  const [data, setData] = useState<HealthRow[]>([]);
  const [kpis, setKpis] = useState<HealthKPIs>({
    new_ttm: 0,
    at_risk_current: 0,
    churned_current: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const brandParam = brand === "all" ? null : brand;

      const { data: rows, error } = await supabase
        .rpc("dashboard_customer_health", { p_brand: brandParam });

      if (cancelled || error || !rows) {
        if (!cancelled) setLoading(false);
        return;
      }

      const SHORT_MONTHS = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];

      const formatted: HealthRow[] = (rows as { month: string; new_customers: number; at_risk: number; churned: number }[]).map((r) => {
        const d = new Date(r.month);
        const label = `${SHORT_MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
        return {
          month: label,
          new_customers: Number(r.new_customers) || 0,
          at_risk: Number(r.at_risk) || 0,
          churned: Number(r.churned) || 0,
        };
      });

      setData(formatted);

      // KPIs: sum new over TTM, use latest month for at_risk + churned
      const totalNew = formatted.reduce((sum, r) => sum + r.new_customers, 0);
      const latest = formatted[formatted.length - 1];

      setKpis({
        new_ttm: totalNew,
        at_risk_current: latest?.at_risk ?? 0,
        churned_current: latest?.churned ?? 0,
      });

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [brand]);

  return { data, kpis, loading };
}
