"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

/** One calendar day's sales, in chronological order (1st of month → yesterday). */
export type DaySummary = {
  /** Local "YYYY-MM-DD" — the grouping key. */
  dateKey: string;
  /** "Mon, Jul 14". */
  label: string;
  /** "Monday, July 14" — full date for tooltips. */
  dateLong: string;
  /** Short axis label, e.g. "Jul 14". */
  shortLabel: string;
  revenue: number;
  d2cRevenue: number;
  wholesaleRevenue: number;
  orders: number;
  /** Average order value for the day (revenue / orders; 0 when no orders). */
  aov: number;
};

export type DailySalesKPIs = {
  /** Month-to-date revenue (1st → yesterday). */
  mtdRevenue: number;
  mtdOrders: number;
  mtdD2c: number;
  mtdWholesale: number;
  /** Month-to-date average order value (mtdRevenue / mtdOrders). */
  mtdAov: number;
  /** Best single day in the window (revenue). */
  bestDayRevenue: number;
  /** Average revenue per day across days with sales. */
  avgPerDay: number;
  /** Human label for the window, e.g. "Jul 1 – 14". */
  rangeLabel: string;

  /* --- Full-month pace (linear projection off the MTD run rate) --- */
  /** Full month name, e.g. "July". */
  monthLabel: string;
  /** Days elapsed this month through yesterday (the window length). */
  elapsedDays: number;
  /** Total calendar days in the current month. */
  daysInMonth: number;
  /** Projected full-month revenue at the current run rate. */
  paceRevenue: number;
  /** Projected full-month order count. */
  paceOrders: number;
  /** Projected full-month AOV (equals mtdAov under linear projection). */
  paceAov: number;
};

const EMPTY_KPIS: DailySalesKPIs = {
  mtdRevenue: 0,
  mtdOrders: 0,
  mtdD2c: 0,
  mtdWholesale: 0,
  mtdAov: 0,
  bestDayRevenue: 0,
  avgPerDay: 0,
  rangeLabel: "",
  monthLabel: "",
  elapsedDays: 0,
  daysInMonth: 0,
  paceRevenue: 0,
  paceOrders: 0,
  paceAov: 0,
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

function labelOf(dateKey: string): {
  label: string;
  dateLong: string;
  shortLabel: string;
} {
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
    shortLabel: dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  };
}

/**
 * Daily sales log for a month, backed by the dashboard_daily_sales RPC (which
 * mirrors dashboard_monthly_sales' brand/segment/exclusion rules at daily grain,
 * so totals reconcile with the YTD cards). Honours the active brand filter.
 *
 * `monthKey` ("YYYY-MM") selects the month; omit it for the current month. The
 * window is the 1st through the end of that month, but never past **yesterday**
 * — so the current month runs 1st→yesterday (avoids partial-day sync noise) and
 * past months show in full. Pace projects the partial month onto its full length
 * (for a completed month the projection equals the actuals).
 */
export function useDailySalesLog(brand: BrandFilter, monthKey?: string) {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [kpis, setKpis] = useState<DailySalesKPIs>(EMPTY_KPIS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // Resolve the target month (default = current), in the viewer's local time.
      const now = new Date();
      const [tgtYear, tgtMonth0] = monthKey
        ? [Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1]
        : [now.getFullYear(), now.getMonth()];

      const firstOfMonth = new Date(tgtYear, tgtMonth0, 1);
      const lastOfMonth = new Date(tgtYear, tgtMonth0 + 1, 0);
      const yesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1
      );
      // Window end: the month's last day, but never past yesterday. So the
      // current month stops at yesterday; past months show in full.
      const endDate = yesterday < lastOfMonth ? yesterday : lastOfMonth;

      const startKey = dateKeyOf(firstOfMonth);
      const endKey = dateKeyOf(endDate);

      const rangeLabel = `${firstOfMonth.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} – ${endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;

      // No completed days yet (a future month, or the 1st of the current month).
      if (endDate < firstOfMonth) {
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
          const { label, dateLong, shortLabel } = labelOf(dateKey);
          byDay.set(dateKey, {
            dateKey,
            label,
            dateLong,
            shortLabel,
            revenue,
            d2cRevenue: isD2c ? revenue : 0,
            wholesaleRevenue: isD2c ? 0 : revenue,
            orders,
            aov: 0, // filled in below once the day's totals are final
          });
        }
      }

      // Finalize each day's AOV now that revenue/orders are fully summed.
      for (const d of byDay.values()) {
        d.aov = d.orders > 0 ? d.revenue / d.orders : 0;
      }

      // Fill any missing calendar days in the window (1st → endDate) with
      // zeros. The RPC only returns days that had completed sales, so without
      // this the log/chart skip zero-sales days and the month looks gappy.
      for (
        let cur = new Date(firstOfMonth);
        cur <= endDate;
        cur.setDate(cur.getDate() + 1)
      ) {
        const key = dateKeyOf(cur);
        if (!byDay.has(key)) {
          const { label, dateLong, shortLabel } = labelOf(key);
          byDay.set(key, {
            dateKey: key,
            label,
            dateLong,
            shortLabel,
            revenue: 0,
            d2cRevenue: 0,
            wholesaleRevenue: 0,
            orders: 0,
            aov: 0,
          });
        }
      }

      const summaries = [...byDay.values()].sort((a, b) =>
        a.dateKey < b.dateKey ? -1 : 1
      ); // chronological: 1st of month first → yesterday last

      const mtdRevenue = summaries.reduce((s, d) => s + d.revenue, 0);
      const mtdOrders = summaries.reduce((s, d) => s + d.orders, 0);
      const mtdD2c = summaries.reduce((s, d) => s + d.d2cRevenue, 0);
      const mtdWholesale = summaries.reduce((s, d) => s + d.wholesaleRevenue, 0);
      const bestDayRevenue = summaries.reduce(
        (m, d) => Math.max(m, d.revenue),
        0
      );
      const mtdAov = mtdOrders > 0 ? mtdRevenue / mtdOrders : 0;

      // Pace = linear projection off the run rate so far. Elapsed days counts
      // every calendar day 1st→yesterday (including zero-sales days), and we
      // project onto the full month — so weekends dilute the rate and future
      // weekends are already reflected in the projection.
      const elapsedDays = endDate.getDate(); // 1st..endDate inclusive
      const daysInMonth = lastOfMonth.getDate();
      const scale = elapsedDays > 0 ? daysInMonth / elapsedDays : 0;
      const paceRevenue = mtdRevenue * scale;
      const paceOrders = Math.round(mtdOrders * scale);
      const paceAov = paceOrders > 0 ? paceRevenue / paceOrders : mtdAov;

      setDays(summaries);
      setKpis({
        mtdRevenue,
        mtdOrders,
        mtdD2c,
        mtdWholesale,
        mtdAov,
        bestDayRevenue,
        avgPerDay: summaries.length > 0 ? mtdRevenue / summaries.length : 0,
        rangeLabel,
        monthLabel: firstOfMonth.toLocaleDateString("en-US", { month: "long" }),
        elapsedDays,
        daysInMonth,
        paceRevenue,
        paceOrders,
        paceAov,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand, monthKey]);

  return { days, kpis, loading, error };
}
