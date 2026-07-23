"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

/**
 * YoY sales-driver decomposition for a selectable period vs the matching period
 * a year earlier (MTD, YTD, or trailing 12 months). Backed by the
 * dashboard_sales_drivers RPC (per-product revenue + units for both windows).
 * Splits the revenue change into a price-volume-mix bridge whose parts sum
 * exactly to ΔRevenue:
 *
 *   Volume — more/fewer units on continuing products, at last year's avg price
 *   Mix    — shift of unit share between products (computed as the residual)
 *   Price  — price-per-unit changes on continuing products
 *   New    — revenue from products sold this year but not last year
 *   Lost   — revenue lost from products sold last year but not this year
 *
 * Everything reconciles with the monthly/daily figures by construction (same
 * source + rules). Windows always end at yesterday to avoid partial-day noise.
 */

export type DriverPeriod = "mtd" | "ytd" | "ttm";

/** A key/value row of backing data shown in the bar's hover card. */
export type DriverDetail = { label: string; value: string };

export type Driver = { key: string; label: string; amount: number; detail: DriverDetail[] };

export type SalesDrivers = {
  /** e.g. "July", "2026 YTD", "Trailing 12 months". */
  scopeLabel: string;
  /** e.g. "last year" / "the prior 12 months" — completes the headline. */
  comparisonLabel: string;
  /** The two compared date ranges, spelled out. */
  windowLabel: string;
  /** Short x-axis labels for the two endpoint bars, e.g. "2025" / "2026". */
  priorLabel: string;
  curLabel: string;
  curRevenue: number;
  priorRevenue: number;
  /** Total units sold in each window (endpoint hover cards). */
  curUnits: number;
  priorUnits: number;
  delta: number;
  deltaPct: number | null;
  drivers: Driver[];
};

type DriverRow = {
  period: "cur" | "prior" | string;
  productnum: string;
  revenue: number | string;
  units: number | string;
};

type Agg = { revenue: number; units: number };

type Windows = {
  curStart: Date;
  curEnd: Date;
  priorStart: Date;
  priorEnd: Date;
  scopeLabel: string;
  comparisonLabel: string;
  priorLabel: string;
  curLabel: string;
};

export function brandParam(brand: BrandFilter): string | null {
  return brand === "all" ? null : brand;
}

export function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add months, clamping the day to the target month's length (no rollover). */
function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Compute the current + prior comparison windows for a period. Returns null
 * when there's nothing completed yet (e.g. MTD on the 1st, YTD on Jan 1).
 */
export function computeWindows(period: DriverPeriod, now: Date): Windows | null {
  const curYear = now.getFullYear();
  const curMonth0 = now.getMonth();
  const yesterday = new Date(curYear, curMonth0, now.getDate() - 1);

  if (period === "ttm") {
    return {
      curStart: addDays(addMonths(yesterday, -12), 1),
      curEnd: yesterday,
      priorStart: addDays(addMonths(yesterday, -24), 1),
      priorEnd: addMonths(yesterday, -12),
      scopeLabel: "Trailing 12 months",
      comparisonLabel: "the prior 12 months",
      priorLabel: "Prior 12mo",
      curLabel: "Last 12mo",
    };
  }

  if (period === "ytd") {
    const curStart = new Date(curYear, 0, 1);
    if (yesterday < curStart) return null; // Jan 1
    const ym = yesterday.getMonth();
    const priorMonthDays = new Date(curYear - 1, ym + 1, 0).getDate();
    return {
      curStart,
      curEnd: yesterday,
      priorStart: new Date(curYear - 1, 0, 1),
      priorEnd: new Date(curYear - 1, ym, Math.min(yesterday.getDate(), priorMonthDays)),
      scopeLabel: `${curYear} YTD`,
      comparisonLabel: "last year",
      priorLabel: `${curYear - 1}`,
      curLabel: `${curYear}`,
    };
  }

  // mtd
  const curStart = new Date(curYear, curMonth0, 1);
  if (yesterday < curStart) return null; // the 1st
  const elapsedDays = yesterday.getDate();
  const priorMonthDays = new Date(curYear - 1, curMonth0 + 1, 0).getDate();
  return {
    curStart,
    curEnd: yesterday,
    priorStart: new Date(curYear - 1, curMonth0, 1),
    priorEnd: new Date(curYear - 1, curMonth0, Math.min(elapsedDays, priorMonthDays)),
    scopeLabel: now.toLocaleDateString("en-US", { month: "long" }),
    comparisonLabel: "last year",
    priorLabel: `${curYear - 1}`,
    curLabel: `${curYear}`,
  };
}

export function useSalesDrivers(brand: BrandFilter, enabled = true, period: DriverPeriod = "mtd") {
  const [data, setData] = useState<SalesDrivers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return; // don't fetch until the panel is opened
    let cancelled = false;

    async function load() {
      setLoading(true);

      const win = computeWindows(period, new Date());
      if (!win) {
        if (!cancelled) {
          setData(null);
          setError(null);
          setLoading(false);
        }
        return;
      }
      const { curStart, curEnd, priorStart, priorEnd } = win;

      const { data: rows, error: rpcErr } = await supabase.rpc("dashboard_sales_drivers", {
        p_brand: brandParam(brand),
        p_cur_start: dateKeyOf(curStart),
        p_cur_end: dateKeyOf(curEnd),
        p_prior_start: dateKeyOf(priorStart),
        p_prior_end: dateKeyOf(priorEnd),
      });

      if (cancelled) return;
      if (rpcErr) {
        setError(rpcErr.message);
        setLoading(false);
        return;
      }
      setError(null);

      // Fold to per-product totals per period (summing over segment).
      const cur = new Map<string, Agg>();
      const prior = new Map<string, Agg>();

      for (const r of (rows ?? []) as DriverRow[]) {
        const rev = Number(r.revenue) || 0;
        const units = Number(r.units) || 0;
        const target = r.period === "cur" ? cur : prior;
        const existing = target.get(r.productnum);
        if (existing) {
          existing.revenue += rev;
          existing.units += units;
        } else {
          target.set(r.productnum, { revenue: rev, units });
        }
      }

      const R1 = [...cur.values()].reduce((s, a) => s + a.revenue, 0);
      const R0 = [...prior.values()].reduce((s, a) => s + a.revenue, 0);
      const U1 = [...cur.values()].reduce((s, a) => s + a.units, 0);
      const U0 = [...prior.values()].reduce((s, a) => s + a.units, 0);

      // Continuing products (in both windows): volume + price effects.
      let R0c = 0, R1c = 0, Q0c = 0, Q1c = 0, priceEffect = 0;
      let newRev = 0, lostRev = 0, newCount = 0, lostCount = 0;

      for (const key of new Set([...cur.keys(), ...prior.keys()])) {
        const c = cur.get(key);
        const p = prior.get(key);
        const cRev = c?.revenue ?? 0;
        const pRev = p?.revenue ?? 0;

        if (c && p) {
          R0c += pRev;
          R1c += cRev;
          Q0c += p.units;
          Q1c += c.units;
          if (p.units > 0 && c.units > 0) {
            const p0 = pRev / p.units;
            const p1 = cRev / c.units;
            priceEffect += c.units * (p1 - p0);
          }
        } else if (c && !p) {
          newRev += cRev;
          newCount += 1;
        } else if (p && !c) {
          lostRev += pRev;
          lostCount += 1;
        }
      }

      const avgP0c = Q0c > 0 ? R0c / Q0c : 0;
      const volumeEffect = (Q1c - Q0c) * avgP0c;
      // Mix is the residual of the continuing-product change — this keeps the
      // bridge summing exactly to ΔRevenue regardless of edge cases.
      const mixEffect = R1c - R0c - volumeEffect - priceEffect;
      // Weighted price change per current-year unit — reconstructs priceEffect
      // exactly (priceEffect = pricePerUnit × Q1c).
      const pricePerUnit = Q1c > 0 ? priceEffect / Q1c : 0;

      const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
      const money2 = (n: number) =>
        "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const int0 = (n: number) => Math.round(n).toLocaleString("en-US");
      const signedInt = (n: number) => (n >= 0 ? "+" : "−") + int0(Math.abs(n));
      const signed2 = (n: number) => (n >= 0 ? "+" : "−") + money2(n);

      const drivers: Driver[] = [
        {
          key: "volume",
          label: "Volume",
          amount: volumeEffect,
          detail: [
            { label: "Units (same products)", value: `${int0(Q0c)} → ${int0(Q1c)}` },
            { label: "Change", value: `${signedInt(Q1c - Q0c)} units` },
            { label: "At LY avg price", value: `${money2(avgP0c)}/unit` },
          ],
        },
        {
          key: "mix",
          label: "Mix",
          amount: mixEffect,
          detail: [
            { label: "Same-product revenue", value: `${money0(R0c)} → ${money0(R1c)}` },
            { label: "What it is", value: "product-mix shift (residual)" },
          ],
        },
        {
          key: "price",
          label: "Price",
          amount: priceEffect,
          detail: [
            { label: "Avg price change", value: `${signed2(pricePerUnit)}/unit` },
            { label: "On units", value: `${int0(Q1c)}` },
          ],
        },
        {
          key: "new",
          label: "New products",
          amount: newRev,
          detail: [
            { label: "Products", value: int0(newCount) },
            { label: "Revenue", value: money0(newRev) },
          ],
        },
        {
          key: "lost",
          label: "Lost products",
          amount: -lostRev,
          detail: [
            { label: "Products", value: int0(lostCount) },
            { label: "Revenue lost", value: money0(lostRev) },
          ],
        },
      ];

      const delta = R1 - R0;
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      setData({
        scopeLabel: win.scopeLabel,
        comparisonLabel: win.comparisonLabel,
        windowLabel: `${fmt(curStart)} – ${fmt(curEnd)}  vs  ${fmt(priorStart)} – ${fmt(priorEnd)}`,
        priorLabel: win.priorLabel,
        curLabel: win.curLabel,
        curRevenue: R1,
        priorRevenue: R0,
        curUnits: U1,
        priorUnits: U0,
        delta,
        deltaPct: R0 > 0 ? (delta / R0) * 100 : null,
        drivers,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand, enabled, period]);

  return { data, loading, error };
}
