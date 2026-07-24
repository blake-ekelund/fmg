"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type RepSalesRow = {
  rep_group_name: string;
  territory: string;
  commission_pct: number;
  customers: number;
  sales_2026: number; // 2026 YTD (customer_summary; year isn't over)
  sales_2025: number; // full-year 2025 (customer_summary)
  variance: number; // full-year basis (sales_2026 − full-year 2025)
  variance_pct: number;
  /* Same-window YTD comparison (Jan 1 → today, both years), aggregated from
     raw orders — the honest read. Full-year 2025 flatters the decline because
     2026 is only part-way through. The dashboard's rep alert uses these. */
  sales_2025_ytd: number;
  sales_2026_ytd: number;
  ytd_variance: number; // sales_2026_ytd − sales_2025_ytd
  ytd_variance_pct: number;
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

      /* customerid → rep group name, for bucketing raw orders below. Built here
         since we're already walking every customer. */
      const custToRep = new Map<string, string>();
      for (const cust of custs) {
        if (!cust.agency_code) continue;
        const code = cust.agency_code.trim();
        const rep = agencyToRep.get(code);
        if (!rep) continue;

        const agg = aggMap.get(rep.name)!;
        agg.customers++;
        agg.sales_2026 += cust.sales_2026 ?? 0;
        agg.sales_2025 += cust.sales_2025 ?? 0;
        custToRep.set(cust.customerid, rep.name);
      }

      /* ── YTD (Jan 1 → today) per rep, from raw orders ──
         customer_summary only stores whole-year sales, so a same-window compare
         has to be summed from sales_orders_raw. Paginated: PostgREST caps a
         request at 1000 rows, and company-wide there are far more, so a single
         fetch would silently undercount. */
      const now = new Date();
      const cutoff = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
      const ytdByRep = new Map<string, { y25: number; y26: number }>();
      for (const rep of reps) ytdByRep.set(rep.name, { y25: 0, y26: 0 });

      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: ord, error: ordErr } = await supabase
          .from("sales_orders_raw")
          .select("customerid, datecompleted, totalprice")
          .gte("datecompleted", "2025-01-01")
          .not("datecompleted", "is", null)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (ordErr || !ord || ord.length === 0) break;

        for (const o of ord as {
          customerid: string | null;
          datecompleted: string | null;
          totalprice: number | null;
        }[]) {
          const repName = o.customerid ? custToRep.get(o.customerid) : undefined;
          if (!repName || !o.datecompleted) continue; // not a rep customer (or brand-filtered out)
          const d = new Date(o.datecompleted);
          const yr = d.getUTCFullYear();
          if (yr !== 2025 && yr !== 2026) continue;
          const stamp = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
          if (stamp > cutoff) continue; // past today's date in that year
          const b = ytdByRep.get(repName)!;
          if (yr === 2025) b.y25 += o.totalprice ?? 0;
          else b.y26 += o.totalprice ?? 0;
        }
        if (ord.length < PAGE) break;
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

        const y = ytdByRep.get(r.name) ?? { y25: 0, y26: 0 };
        const ytd_variance = y.y26 - y.y25;
        const ytd_variance_pct =
          y.y25 > 0 ? (ytd_variance / y.y25) * 100 : y.y26 > 0 ? 100 : 0;

        return {
          rep_group_name: r.name,
          territory: r.territory,
          commission_pct: r.commission_pct,
          customers: agg.customers,
          sales_2026: agg.sales_2026,
          sales_2025: agg.sales_2025,
          variance,
          variance_pct,
          sales_2025_ytd: y.y25,
          sales_2026_ytd: y.y26,
          ytd_variance,
          ytd_variance_pct,
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
