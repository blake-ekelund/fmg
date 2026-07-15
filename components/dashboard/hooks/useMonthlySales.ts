"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

/**
 * Monthly sales results for the dashboard — the current year's months with the
 * prior year's same-month value alongside (a YoY read), plus the current
 * month's on-pace projection.
 *
 * Aggregated from the same `dashboard_daily_sales` RPC the daily log uses: an
 * order completes on exactly one day, so summing daily order counts gives the
 * exact monthly order total (and therefore AOV). No separate monthly RPC —
 * these numbers reconcile with the daily log and YTD cards by construction.
 * The current-month bucket only covers 1st→yesterday (the RPC is bounded at
 * yesterday), so it doubles as the MTD figure the pace projects from.
 */

export type MonthRow = {
  /** "YYYY-MM" for the current-year month — the drill-down key. */
  monthKey: string;
  monthNum: number; // 1..12
  monthLabel: string; // "Jan"
  orders: number;
  revenue: number;
  aov: number;
  /** Same month, prior year. */
  priorRevenue: number;
  priorOrders: number;
  /** revenue − priorRevenue. */
  variance: number;
  variancePct: number | null;
  isCurrent: boolean;
  /** Current month, not yet complete (only partial data so far). */
  isPartial: boolean;
};

export type MonthlyPace = {
  monthLabel: string;
  elapsedDays: number;
  daysInMonth: number;
  mtdRevenue: number;
  mtdOrders: number;
  mtdAov: number;
  paceRevenue: number;
  paceOrders: number;
  paceAov: number;
};

/**
 * Seasonality-aware full-year estimate: YTD actuals + last year's remaining
 * months scaled by the YoY growth we're running so far. Keeps last year's
 * seasonal shape instead of assuming a flat run-rate.
 */
export type MonthlyEstimate = {
  year: number;
  revenue: number;
  orders: number;
  aov: number;
  /** YoY growth rate applied to the remaining months (null if no prior baseline). */
  yoyPct: number | null;
  /** YTD actuals that anchor the estimate. */
  ytdRevenue: number;
  ytdOrders: number;
};

const EMPTY_PACE: MonthlyPace = {
  monthLabel: "",
  elapsedDays: 0,
  daysInMonth: 0,
  mtdRevenue: 0,
  mtdOrders: 0,
  mtdAov: 0,
  paceRevenue: 0,
  paceOrders: 0,
  paceAov: 0,
};

const EMPTY_ESTIMATE: MonthlyEstimate = {
  year: 0,
  revenue: 0,
  orders: 0,
  aov: 0,
  yoyPct: null,
  ytdRevenue: 0,
  ytdOrders: 0,
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type DailyRow = {
  day: string; // "YYYY-MM-DD"
  segment: string;
  revenue: number | string;
  orders: number | string;
};

function brandParam(brand: BrandFilter): string | null {
  return brand === "all" ? null : brand;
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useMonthlySales(brand: BrandFilter) {
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [pace, setPace] = useState<MonthlyPace>(EMPTY_PACE);
  const [estimate, setEstimate] = useState<MonthlyEstimate>(EMPTY_ESTIMATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const now = new Date();
      const curYear = now.getFullYear();
      const curMonthNum = now.getMonth() + 1; // 1-based
      const yesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1
      );

      // Days elapsed this month = yesterday's date, unless today is the 1st
      // (yesterday sits in the prior month → nothing completed this month yet).
      const elapsedDays =
        yesterday.getMonth() === now.getMonth() ? yesterday.getDate() : 0;
      const daysInMonth = new Date(curYear, curMonthNum, 0).getDate();

      // Pull this year + last year up to yesterday, in one call.
      const start = dateKeyOf(new Date(curYear - 1, 0, 1));
      const end = dateKeyOf(yesterday);

      const { data: rows, error: rpcErr } = await supabase.rpc(
        "dashboard_daily_sales",
        { p_brand: brandParam(brand), p_start: start, p_end: end }
      );

      if (cancelled) return;
      if (rpcErr) {
        setError(rpcErr.message);
        setLoading(false);
        return;
      }
      setError(null);

      // Fold days → per (year, month) revenue + orders. Separately track the
      // prior-year MTD window (same month, days 1..elapsedDays) so the current
      // month's YoY compares like-for-like (partial vs partial), not against a
      // full prior month.
      const agg = new Map<string, { revenue: number; orders: number }>();
      let priorMtdRevenue = 0;
      let priorMtdOrders = 0;
      for (const r of (rows ?? []) as DailyRow[]) {
        const year = Number(r.day.slice(0, 4));
        const monthNum = Number(r.day.slice(5, 7));
        const dayNum = Number(r.day.slice(8, 10));
        const rev = Number(r.revenue) || 0;
        const ord = Number(r.orders) || 0;

        const key = `${year}-${monthNum}`;
        const bucket = agg.get(key) ?? { revenue: 0, orders: 0 };
        bucket.revenue += rev;
        bucket.orders += ord;
        agg.set(key, bucket);

        if (year === curYear - 1 && monthNum === curMonthNum && dayNum <= elapsedDays) {
          priorMtdRevenue += rev;
          priorMtdOrders += ord;
        }
      }

      // Build current-year months Jan → current month.
      const rowsOut: MonthRow[] = [];
      for (let m = 1; m <= curMonthNum; m++) {
        const isCurrent = m === curMonthNum;
        const cur = agg.get(`${curYear}-${m}`) ?? { revenue: 0, orders: 0 };
        // Completed months compare full-vs-full; the partial current month
        // compares MTD-vs-same-period-last-year.
        const prior = isCurrent
          ? { revenue: priorMtdRevenue, orders: priorMtdOrders }
          : agg.get(`${curYear - 1}-${m}`) ?? { revenue: 0, orders: 0 };
        const variance = cur.revenue - prior.revenue;
        rowsOut.push({
          monthKey: `${curYear}-${String(m).padStart(2, "0")}`,
          monthNum: m,
          monthLabel: MONTH_LABELS[m - 1],
          orders: cur.orders,
          revenue: cur.revenue,
          aov: cur.orders > 0 ? cur.revenue / cur.orders : 0,
          priorRevenue: prior.revenue,
          priorOrders: prior.orders,
          variance,
          variancePct: prior.revenue > 0 ? (variance / prior.revenue) * 100 : null,
          isCurrent,
          isPartial: isCurrent,
        });
      }

      // Current-month estimate. The current-month bucket spans 1st→yesterday,
      // so it IS the MTD figure. Project the rest of the month using LAST YEAR'S
      // SHAPE — this month's MTD + (last year's rest-of-month × the month's YoY
      // run so far) — matching the full-year method. Fall back to a linear run
      // rate only when there's no prior baseline for the elapsed window.
      const mtd = agg.get(`${curYear}-${curMonthNum}`) ?? { revenue: 0, orders: 0 };
      const priorMonth = agg.get(`${curYear - 1}-${curMonthNum}`) ?? { revenue: 0, orders: 0 };
      const mtdAov = mtd.orders > 0 ? mtd.revenue / mtd.orders : 0;
      const scale = elapsedDays > 0 ? daysInMonth / elapsedDays : 0;

      const monthGrowthRev = priorMtdRevenue > 0 ? mtd.revenue / priorMtdRevenue : null;
      const monthGrowthOrd = priorMtdOrders > 0 ? mtd.orders / priorMtdOrders : null;
      const paceRevenue =
        monthGrowthRev != null
          ? mtd.revenue + (priorMonth.revenue - priorMtdRevenue) * monthGrowthRev
          : mtd.revenue * scale;
      const paceOrders = Math.round(
        monthGrowthOrd != null
          ? mtd.orders + (priorMonth.orders - priorMtdOrders) * monthGrowthOrd
          : mtd.orders * scale,
      );

      setMonths(rowsOut);
      setPace({
        monthLabel: now.toLocaleDateString("en-US", { month: "long" }),
        elapsedDays,
        daysInMonth,
        mtdRevenue: mtd.revenue,
        mtdOrders: mtd.orders,
        mtdAov,
        paceRevenue,
        paceOrders,
        paceAov: paceOrders > 0 ? paceRevenue / paceOrders : mtdAov,
      });

      // ── Seasonality-aware full-year estimate ──
      // YTD actuals + last year's remaining months scaled by the YoY growth
      // we're running. The prior-year "matched YTD" uses full completed months
      // plus the prior current-month MTD (priorMtd*) so the growth ratio is
      // like-for-like with this year's partial current month.
      const ytdRevenue = rowsOut.reduce((s, r) => s + r.revenue, 0);
      const ytdOrders = rowsOut.reduce((s, r) => s + r.orders, 0);

      let priorYtdRevenue = priorMtdRevenue;
      let priorYtdOrders = priorMtdOrders;
      for (let m = 1; m < curMonthNum; m++) {
        const pm = agg.get(`${curYear - 1}-${m}`);
        if (pm) {
          priorYtdRevenue += pm.revenue;
          priorYtdOrders += pm.orders;
        }
      }

      let priorFullRevenue = 0;
      let priorFullOrders = 0;
      for (let m = 1; m <= 12; m++) {
        const pm = agg.get(`${curYear - 1}-${m}`);
        if (pm) {
          priorFullRevenue += pm.revenue;
          priorFullOrders += pm.orders;
        }
      }

      const growthRev = priorYtdRevenue > 0 ? ytdRevenue / priorYtdRevenue : null;
      const growthOrd = priorYtdOrders > 0 ? ytdOrders / priorYtdOrders : null;
      const estRevenue =
        growthRev != null ? ytdRevenue + (priorFullRevenue - priorYtdRevenue) * growthRev : ytdRevenue;
      const estOrders =
        growthOrd != null ? ytdOrders + (priorFullOrders - priorYtdOrders) * growthOrd : ytdOrders;

      setEstimate({
        year: curYear,
        revenue: estRevenue,
        orders: Math.round(estOrders),
        aov: estOrders > 0 ? estRevenue / estOrders : 0,
        yoyPct: growthRev != null ? (growthRev - 1) * 100 : null,
        ytdRevenue,
        ytdOrders,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  return { months, pace, estimate, loading, error };
}
