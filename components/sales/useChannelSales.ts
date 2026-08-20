"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBrand } from "@/components/BrandContext";

export type ChannelMonth = {
  month: string;
  /** null = the month sits outside what the source covers, which is not zero. */
  wholesale: number | null;
  d2c: number | null;
};

type RpcRow = { month: string; segment: string; revenue: string | number };

/**
 * Monthly revenue split into Wholesale and D2C.
 *
 * Reads `dashboard_monthly_sales`, the same RPC the dashboard's channel KPIs
 * use, rather than deriving the split here. The segment rule (which customer
 * ids are the storefront accounts) and the line-item filtering both live in
 * that function; a second derivation in the client would drift from the
 * dashboard the first time either changed, and the two pages would quietly
 * disagree about what D2C earned.
 *
 * The cost of that choice is coverage: the RPC only returns the months it was
 * written for. `coverageStart` reports the earliest month it returned, and any
 * requested month before it comes back null — absent, not zero — so the UI can
 * say "no data here" instead of drawing a floor.
 */
export function useChannelSales() {
  const { brand } = useBrand();
  const [rows, setRows] = useState<RpcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: rpcErr } = await supabase.rpc("dashboard_monthly_sales", {
        p_brand: brand === "all" ? null : brand,
      });

      if (cancelled) return;
      if (rpcErr) {
        setError(rpcErr.message);
        setRows([]);
      } else {
        setRows((data as RpcRow[]) ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  const { byMonth, coverageStart, coverageEnd } = useMemo(() => {
    const map = new Map<string, { wholesale: number; d2c: number }>();
    for (const r of rows) {
      const entry = map.get(r.month) ?? { wholesale: 0, d2c: 0 };
      const revenue = Number(r.revenue) || 0;
      if (r.segment === "D2C") entry.d2c += revenue;
      else if (r.segment === "Wholesale") entry.wholesale += revenue;
      map.set(r.month, entry);
    }
    const months = [...map.keys()].sort();
    return {
      byMonth: map,
      coverageStart: months[0] ?? null,
      coverageEnd: months[months.length - 1] ?? null,
    };
  }, [rows]);

  /** The 12 slots of a window, with months outside coverage left null. */
  function seriesFor(months: string[]): ChannelMonth[] {
    return months.map((month) => {
      const covered =
        coverageStart != null && month >= coverageStart &&
        (coverageEnd == null || month <= coverageEnd);
      const entry = byMonth.get(month);
      return {
        month,
        wholesale: covered ? (entry?.wholesale ?? 0) : null,
        d2c: covered ? (entry?.d2c ?? 0) : null,
      };
    });
  }

  return { seriesFor, coverageStart, coverageEnd, loading, error };
}

/** Totals for a window, plus how many of its months the source actually covers. */
export function totalsFor(series: ChannelMonth[]) {
  let wholesale = 0;
  let d2c = 0;
  let coveredMonths = 0;

  for (const m of series) {
    if (m.wholesale == null && m.d2c == null) continue;
    wholesale += m.wholesale ?? 0;
    d2c += m.d2c ?? 0;
    coveredMonths++;
  }

  const total = wholesale + d2c;
  return {
    wholesale,
    d2c,
    total,
    coveredMonths,
    /** Every month of the window has data, so a comparison against it is fair. */
    complete: coveredMonths === series.length,
    wholesaleShare: total ? wholesale / total : null,
    d2cShare: total ? d2c / total : null,
  };
}
