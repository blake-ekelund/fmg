"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

/** One calendar day's sales, newest day first. */
export type DaySummary = {
  /** Local "YYYY-MM-DD" — the grouping key. */
  dateKey: string;
  /** "Mon, Jul 14". */
  label: string;
  /** "Monday, July 14" — full date for tooltips. */
  dateLong: string;
  revenue: number;
  d2cRevenue: number;
  wholesaleRevenue: number;
  orders: number;
};

export type DailySalesKPIs = {
  /** Month-to-date revenue (1st → yesterday). */
  mtdRevenue: number;
  mtdOrders: number;
  mtdD2c: number;
  mtdWholesale: number;
  /** Best single day in the window (revenue). */
  bestDayRevenue: number;
  /** Average revenue per day across days with sales. */
  avgPerDay: number;
  /** Human label for the window, e.g. "Jul 1 – 14". */
  rangeLabel: string;
};

const EMPTY_KPIS: DailySalesKPIs = {
  mtdRevenue: 0,
  mtdOrders: 0,
  mtdD2c: 0,
  mtdWholesale: 0,
  bestDayRevenue: 0,
  avgPerDay: 0,
  rangeLabel: "",
};

type DailyRow = {
  day: string; // "YYYY-MM-DD"
  segment: "D2C" | "Wholesale" | string;
  revenue: number | string;
  orders: number | string;
};

/** Brand filter → inventory_products.brand value (null = all brands). */
function brandParam(brand: BrandFilter): string | null {
  return brand === "all" ? null : brand; // "NI" | "Sassy"
}

/** Local calendar-day key, e.g. "2026-07-15" (avoids UTC date shift). */
function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function labelOf(dateKey: string): { label: string; dateLong: string } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    label: dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    dateLong: dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
  };
}

/**
 * Daily sales log for the current month, month-to-date **through yesterday**.
 * Backed by the dashboard_daily_sales RPC, which mirrors dashboard_monthly_sales'
 * brand/segment/exclusion rules at daily grain — so these totals reconcile with
 * the YTD sales cards. Honours the active brand filter. `datecompleted` is
 * Fishbowl's local calendar date, so the "through yesterday" bound also avoids
 * partial-day noise from the intraday sync.
 */
export function useDailySalesLog(brand: BrandFilter) {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [kpis, setKpis] = useState<DailySalesKPIs>(EMPTY_KPIS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // Window: 1st of the current month → yesterday, in the viewer's local time.
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const yesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1
      );
      const startKey = dateKeyOf(firstOfMonth);
      const endKey = dateKeyOf(yesterday);

      const rangeLabel = `${firstOfMonth.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} – ${yesterday.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;

      // On the 1st of the month there is no completed day yet this month.
      if (yesterday < firstOfMonth) {
        if (!cancelled) {
          setDays([]);
          setKpis({ ...EMPTY_KPIS, rangeLabel: "this month" });
          setError(null);
          setLoading(false);
        }
        return;
      }

      const { data: rows, error: rpcErr } = await supabase.rpc(
        "dashboard_daily_sales",
        { p_brand: brandParam(brand), p_start: startKey, p_end: endKey }
      );

      if (cancelled) return;
      if (rpcErr) {
        setError(rpcErr.message);
        setLoading(false);
        return;
      }
      setError(null);

      // Fold the (day, segment) rows into one entry per day.
      const byDay = new Map<string, DaySummary>();
      for (const r of (rows ?? []) as DailyRow[]) {
        const dateKey = r.day;
        const revenue = Number(r.revenue) || 0;
        const orders = Number(r.orders) || 0;
        const isD2c = r.segment === "D2C";
        const existing = byDay.get(dateKey);
        if (existing) {
          existing.revenue += revenue;
          existing.orders += orders;
          existing.d2cRevenue += isD2c ? revenue : 0;
          existing.wholesaleRevenue += isD2c ? 0 : revenue;
        } else {
          const { label, dateLong } = labelOf(dateKey);
          byDay.set(dateKey, {
            dateKey,
            label,
            dateLong,
            revenue,
            d2cRevenue: isD2c ? revenue : 0,
            wholesaleRevenue: isD2c ? 0 : revenue,
            orders,
          });
        }
      }

      const summaries = [...byDay.values()].sort((a, b) =>
        a.dateKey < b.dateKey ? 1 : -1
      ); // newest day first

      const mtdRevenue = summaries.reduce((s, d) => s + d.revenue, 0);
      const mtdOrders = summaries.reduce((s, d) => s + d.orders, 0);
      const mtdD2c = summaries.reduce((s, d) => s + d.d2cRevenue, 0);
      const mtdWholesale = summaries.reduce((s, d) => s + d.wholesaleRevenue, 0);
      const bestDayRevenue = summaries.reduce(
        (m, d) => Math.max(m, d.revenue),
        0
      );

      setDays(summaries);
      setKpis({
        mtdRevenue,
        mtdOrders,
        mtdD2c,
        mtdWholesale,
        bestDayRevenue,
        avgPerDay: summaries.length > 0 ? mtdRevenue / summaries.length : 0,
        rangeLabel,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  return { days, kpis, loading, error };
}
