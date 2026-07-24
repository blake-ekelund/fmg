"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";
import type { DashboardInventoryItem } from "./useDashboardInventory";
import type { RepSalesRow } from "./useDashboardRepSales";
import { computeWindows, dateKeyOf, brandParam } from "./useSalesDrivers";
import {
  COVERAGE_MONTHS,
  OVERSTOCK_MIN_MONTHS,
  isOverstock,
  isUnderstock,
} from "@/lib/inventoryHealth";

/**
 * The founder-facing exception list.
 *
 * Every widget on the dashboard speaks a different unit — customers, SKUs,
 * reps, tasks — which makes them impossible to compare, so nothing gets
 * prioritised. This hook converts each signal into a founder move.
 *
 * Two kinds of item:
 *   • moves   — a specific, ranked-by-dollars thing to do (a sliding rep).
 *   • reviews — a standing "go look at this list" ask that shouldn't compete
 *               with, or be buried under, the ranked moves. Inventory is the
 *               case: 50 individual SKU alerts drowned everything else, so
 *               understock and overstock each collapse to a single review.
 *
 * Lapsing/churning accounts are deliberately absent: automated at-risk (180d)
 * and churn (365d) email flows, plus rep-group outreach in between, own that
 * recovery, so listing those accounts here would just duplicate work already
 * in motion.
 */

export type AlertKind = "move" | "review";
export type AlertLever = "rep" | "understock" | "overstock";

export type DashboardAlert = {
  id: string;
  kind: AlertKind;
  lever: AlertLever;
  /** Dollar magnitude used for ranking moves (and the "at stake" total). */
  impact: number;
  /** How `impact` was derived — shown next to the number on moves. */
  basis: string;
  /** SKU count, for review asks that show a count rather than a dollar. */
  count?: number;
  title: string;
  subtitle: string;
  actionLabel: string;
  href: string;
};

/** Below this, a move is noise rather than a decision. */
const MIN_IMPACT = 500;

type PartEconomics = { revenue: number; units: number };

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export type AlertInputs = {
  brand: BrandFilter;
  items: DashboardInventoryItem[];
  repRows: RepSalesRow[];
  /** True while any upstream source is still loading. */
  loading: boolean;
};

/**
 * Takes already-fetched data rather than re-querying: the dashboard loads each
 * source once and hands it to both the pulse and this. Sharing the same rows
 * also means an alert can never contradict the tile above it.
 */
export function useDashboardAlerts({
  brand,
  items,
  repRows,
  loading: inputsLoading,
}: AlertInputs) {
  /* Per-part trailing-twelve-month revenue + units. This is what lets a
     stock-out be priced in revenue rather than guessed at. */
  const [economics, setEconomics] = useState<Map<string, PartEconomics>>(new Map());
  const [econLoading, setEconLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setEconLoading(true);
      const win = computeWindows("ttm", new Date());
      if (!win) {
        if (!cancelled) {
          setEconomics(new Map());
          setEconLoading(false);
        }
        return;
      }

      const { data: rows, error } = await supabase.rpc("dashboard_sales_drivers", {
        p_brand: brandParam(brand),
        p_cur_start: dateKeyOf(win.curStart),
        p_cur_end: dateKeyOf(win.curEnd),
        p_prior_start: dateKeyOf(win.priorStart),
        p_prior_end: dateKeyOf(win.priorEnd),
      });

      if (cancelled) return;
      if (error) {
        // Non-fatal: SKU alerts simply fall back to a COGS basis.
        setEconomics(new Map());
        setEconLoading(false);
        return;
      }

      const map = new Map<string, PartEconomics>();
      for (const r of (rows ?? []) as {
        period: string;
        productnum: string;
        revenue: number | string;
        units: number | string;
      }[]) {
        if (r.period !== "cur") continue; // current window only
        const prev = map.get(r.productnum) ?? { revenue: 0, units: 0 };
        prev.revenue += Number(r.revenue) || 0;
        prev.units += Number(r.units) || 0;
        map.set(r.productnum, prev);
      }

      setEconomics(map);
      setEconLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  const loading = inputsLoading || econLoading;

  const alerts = useMemo<DashboardAlert[]>(() => {
    if (loading) return [];
    const out: DashboardAlert[] = [];

    /* ── Lever: rep ──
       Agencies whose territory is down year over year, measured YTD-vs-YTD (same
       window both years) — comparing YTD 2026 against full-year 2025 would flag
       every rep as "down" just because the year isn't over. Valued at the
       same-window decline. */
    for (const r of repRows) {
      if (r.ytd_variance >= 0) continue;
      const decline = Math.abs(r.ytd_variance);
      if (decline < MIN_IMPACT) continue;

      out.push({
        id: `rep:${r.rep_group_name}`,
        kind: "move",
        lever: "rep",
        impact: decline,
        basis: "YoY YTD decline",
        title: r.rep_group_name,
        subtitle: `Down ${fmtMoney(decline)} (${r.ytd_variance_pct.toFixed(
          0,
        )}%) vs ${fmtMoney(r.sales_2025_ytd)} YTD last year · ${r.customers} accounts${
          r.territory ? ` · ${r.territory}` : ""
        }`,
        actionLabel: "Build analysis",
        href: `/sales-team/rep-analysis/${encodeURIComponent(r.rep_group_name)}`,
      });
    }

    return out.sort((a, b) => b.impact - a.impact);
  }, [loading, repRows]);

  /* ── Reviews: understock + overstock ──
     Inventory used to emit one alert per SKU, which meant 50 near-identical
     lines buried the rep moves. The founder's actual ask is "show me the two
     lists" — so each collapses to a single review, ranked by the whole list,
     not the individual SKUs. Definitions are shared with the inventory page
     (lib/inventoryHealth) so the counts here match what the link lands on. */
  const reviews = useMemo<DashboardAlert[]>(() => {
    if (loading) return [];
    const out: DashboardAlert[] = [];

    // Understock — carries a dollar (revenue we can't fill), priced off TTM
    // revenue-per-unit where we have it.
    let underCount = 0;
    let underImpact = 0;
    let underShortUnits = 0;
    for (const it of items) {
      if (!isUnderstock(it)) continue;
      underCount += 1;
      const shortUnits = Math.max(
        0,
        COVERAGE_MONTHS * it.avg_monthly_demand - (it.on_hand + it.on_order)
      );
      underShortUnits += shortUnits;
      const econ = economics.get(it.part);
      const revPerUnit = econ && econ.units > 0 ? econ.revenue / econ.units : null;
      if (revPerUnit != null) underImpact += shortUnits * revPerUnit;
    }
    if (underCount > 0) {
      out.push({
        id: "review:understock",
        kind: "review",
        lever: "understock",
        impact: underImpact,
        basis: "Unmet demand × TTM price",
        count: underCount,
        title: "Review understock",
        subtitle:
          `${underCount} SKU${underCount > 1 ? "s" : ""} under ${COVERAGE_MONTHS}-mo cover` +
          (underImpact > 0 ? ` · ${fmtMoney(underImpact)} in unmet demand` : "") +
          ` · ${Math.round(underShortUnits).toLocaleString()} units short`,
        actionLabel: "Open inventory",
        href: "/inventory?filter=understock",
      });
    }

    // Overstock — deliberately no dollar. Valuing slow stock at retail
    // overstates it (you'd realise less, not more, by clearing it), so this
    // ranks last and shows a SKU count, not a misleading number.
    const over = items.filter(isOverstock);
    if (over.length > 0) {
      const maxMonths = over.reduce(
        (m, it) => Math.max(m, it.months_of_supply),
        0
      );
      out.push({
        id: "review:overstock",
        kind: "review",
        lever: "overstock",
        impact: 0,
        basis: "Slow movers",
        count: over.length,
        title: "Review overstock",
        subtitle: `${over.length} slow-moving SKU${
          over.length > 1 ? "s" : ""
        } over ${OVERSTOCK_MIN_MONTHS}mo supply · up to ${Math.round(
          maxMonths
        )}mo on hand`,
        actionLabel: "Open inventory",
        href: "/inventory?filter=overstock",
      });
    }

    return out;
  }, [loading, items, economics]);

  /* At stake = the ranked moves plus understock's unmet-demand revenue.
     Overstock is excluded — it's capital to review, not revenue slipping. */
  const totalAtStake = useMemo(
    () =>
      [...alerts, ...reviews]
        .filter((a) => a.lever !== "overstock")
        .reduce((s, a) => s + a.impact, 0),
    [alerts, reviews]
  );

  return { alerts, reviews, totalAtStake, loading };
}
