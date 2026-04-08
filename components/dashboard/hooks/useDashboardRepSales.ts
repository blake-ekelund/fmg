"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type RepSalesRow = {
  rep_group_name: string;
  territory: string;
  commission_pct: number;
  customers: number;
  sales_2026: number;
  sales_2025: number;
  variance: number;
  variance_pct: number;
  estimated_commission: number;
};

export type RepSalesKPIs = {
  total_rep_sales_2026: number;
  total_rep_sales_2025: number;
  total_variance: number;
  total_commission: number;
};

export function useDashboardRepSales(brand: BrandFilter) {
  const [rows, setRows] = useState<RepSalesRow[]>([]);
  const [kpis, setKpis] = useState<RepSalesKPIs>({
    total_rep_sales_2026: 0,
    total_rep_sales_2025: 0,
    total_variance: 0,
    total_commission: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1. Rep groups (master list)
      const { data: repGroups } = await supabase
        .from("rep_groups")
        .select("id, name, territory, commission_pct")
        .order("name");

      // 2. Customer summary with agency_code and yearly sales
      let custQuery = supabase
        .from("customer_summary")
        .select("customerid, name, agency_code, sales_2025, sales_2026");

      if (brand !== "all") {
        custQuery = custQuery.ilike("brands_purchased", `%${brand}%`);
      }

      const { data: customers } = await custQuery;

      if (cancelled) return;

      const reps = (repGroups ?? []) as {
        id: string;
        name: string;
        territory: string;
        commission_pct: number;
      }[];
      const custs = (customers ?? []) as {
        customerid: string;
        name: string;
        agency_code: string | null;
        sales_2025: number | null;
        sales_2026: number | null;
      }[];

      // 3. Aggregate sales by agency_code
      // agency_code on customer_summary maps to rep_groups.name
      // (the exact mapping may vary — try matching by name or code)
      const repNameSet = new Map(reps.map((r) => [r.name, r]));

      // Build a lookup: agency_code → rep group
      // agency_code might be the rep group name itself or a code
      // Let's also try to match numeric codes by building a map
      // If agency_code matches rep name, use it directly
      const agencyToRep = new Map<string, typeof reps[number]>();
      for (const cust of custs) {
        if (!cust.agency_code) continue;
        const code = cust.agency_code.trim();
        if (!agencyToRep.has(code)) {
          // Try matching agency_code to rep group name
          const match = reps.find(
            (r) =>
              r.name.toLowerCase() === code.toLowerCase() ||
              r.name.toLowerCase().includes(code.toLowerCase()) ||
              code.toLowerCase().includes(r.name.toLowerCase())
          );
          if (match) agencyToRep.set(code, match);
        }
      }

      // Aggregate by rep group
      const aggMap = new Map<
        string,
        { customers: number; sales_2026: number; sales_2025: number }
      >();

      for (const rep of reps) {
        aggMap.set(rep.name, { customers: 0, sales_2026: 0, sales_2025: 0 });
      }

      for (const cust of custs) {
        if (!cust.agency_code) continue;
        const code = cust.agency_code.trim();
        const rep = agencyToRep.get(code);
        if (!rep) continue;

        const agg = aggMap.get(rep.name)!;
        agg.customers++;
        agg.sales_2026 += cust.sales_2026 ?? 0;
        agg.sales_2025 += cust.sales_2025 ?? 0;
      }

      // 4. Build rows
      const merged: RepSalesRow[] = reps.map((r) => {
        const agg = aggMap.get(r.name) ?? {
          customers: 0,
          sales_2026: 0,
          sales_2025: 0,
        };
        const variance = agg.sales_2026 - agg.sales_2025;
        const variance_pct =
          agg.sales_2025 > 0
            ? ((agg.sales_2026 - agg.sales_2025) / agg.sales_2025) * 100
            : agg.sales_2026 > 0
              ? 100
              : 0;
        const estimated_commission =
          agg.sales_2026 * (r.commission_pct / 100);

        return {
          rep_group_name: r.name,
          territory: r.territory,
          commission_pct: r.commission_pct,
          customers: agg.customers,
          sales_2026: agg.sales_2026,
          sales_2025: agg.sales_2025,
          variance,
          variance_pct,
          estimated_commission,
        };
      });

      // Sort by 2026 sales descending
      merged.sort((a, b) => b.sales_2026 - a.sales_2026);

      const k: RepSalesKPIs = {
        total_rep_sales_2026: merged.reduce((s, r) => s + r.sales_2026, 0),
        total_rep_sales_2025: merged.reduce((s, r) => s + r.sales_2025, 0),
        total_variance: merged.reduce((s, r) => s + r.variance, 0),
        total_commission: merged.reduce(
          (s, r) => s + r.estimated_commission,
          0
        ),
      };

      setRows(merged);
      setKpis(k);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  return { rows, kpis, loading };
}
