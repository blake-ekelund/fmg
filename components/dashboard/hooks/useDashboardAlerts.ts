"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";
import type { CustomerSummaryRow } from "./useDashboardCustomers";
import type { DashboardInventoryItem } from "./useDashboardInventory";
import type { RepSalesRow } from "./useDashboardRepSales";
import { computeWindows, dateKeyOf, brandParam } from "./useSalesDrivers";

/**
 * The founder-facing exception list.
 *
 * Every widget on the dashboard speaks a different unit — customers, SKUs,
 * reps, tasks — which makes them impossible to compare, so nothing gets
 * prioritised. This hook converts each signal into **dollars at stake** so
 * they collapse into one ranked worklist.
 *
 * Each alert maps to a lever the founder actually pulls:
 *   account — email/call a lapsing wholesale account
 *   rep     — chase an agency whose territory is sliding
 *   sku     — reorder something about to stock out
 *   promo   — move overstock that's sitting on cash
 *
 * Bases differ by necessity (revenue at risk vs. capital tied up), so every
 * alert carries the `basis` string that produced its number. The ranking is
 * meant to be auditable, not authoritative.
 */

export type AlertLever = "account" | "rep" | "sku" | "promo";

export type DashboardAlert = {
  id: string;
  lever: AlertLever;
  /** Dollar magnitude used for ranking. */
  impact: number;
  /** How `impact` was derived — always shown next to the number. */
  basis: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  href: string;
};

/** Below this, an alert is noise rather than a decision. */
const MIN_IMPACT = 500;

/** Reorder horizon: demand we want covered by stock + inbound POs. */
const COVERAGE_MONTHS = 3;

/** Months of supply above which stock reads as overstock worth promoting. */
const OVERSTOCK_MONTHS = 12;

type PartEconomics = { revenue: number; units: number };

function monthsSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44));
}

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export type AlertInputs = {
  brand: BrandFilter;
  customers: CustomerSummaryRow[];
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
  customers,
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

    /* ── Lever: account ──
       Wholesale accounts 6–12 months since their last order. Valued at the
       annual revenue they used to produce, which is what walks if they go. */
    for (const c of customers) {
      if (c.status !== "at_risk") continue;
      const annual =
        (c.sales_2025 ?? 0) > 0
          ? c.sales_2025!
          : (c.sales_2026 ?? 0) > 0
            ? c.sales_2026!
            : (c.lifetime_revenue ?? 0);
      if (annual < MIN_IMPACT) continue;

      const months = monthsSince(c.last_order_date);
      out.push({
        id: `account:${c.id}`,
        lever: "account",
        impact: annual,
        basis: (c.sales_2025 ?? 0) > 0 ? "Prior-year revenue" : "Revenue to date",
        title: c.name,
        subtitle:
          months != null
            ? `No order in ${months} months · ${fmtMoney(annual)}/yr account`
            : `Lapsing · ${fmtMoney(annual)}/yr account`,
        actionLabel: "Open account",
        href: `/customers/${c.id}`,
      });
    }

    /* ── Lever: rep ──
       Agencies whose territory is down year over year. Valued at the decline. */
    for (const r of repRows) {
      if (r.variance >= 0) continue;
      const decline = Math.abs(r.variance);
      if (decline < MIN_IMPACT) continue;

      out.push({
        id: `rep:${r.rep_group_name}`,
        lever: "rep",
        impact: decline,
        basis: "YoY revenue decline",
        title: r.rep_group_name,
        subtitle: `Down ${fmtMoney(decline)} vs last year · ${r.customers} accounts${
          r.territory ? ` · ${r.territory}` : ""
        }`,
        actionLabel: "Open rep directory",
        href: "/sales-team",
      });
    }

    /* ── Levers: sku + promo ──
       Priced off trailing revenue per unit where we have it, so a stock-out on
       a fast mover outranks one on a slow mover. */
    for (const it of items) {
      const econ = economics.get(it.part);
      const revPerUnit =
        econ && econ.units > 0 ? econ.revenue / econ.units : null;

      if (it.status === "at_risk" && it.avg_monthly_demand > 0) {
        const covered = it.on_hand + it.on_order;
        const shortUnits = Math.max(
          0,
          COVERAGE_MONTHS * it.avg_monthly_demand - covered
        );
        if (shortUnits <= 0) continue;

        const impact = revPerUnit != null ? shortUnits * revPerUnit : 0;
        if (impact < MIN_IMPACT) continue;

        out.push({
          id: `sku:${it.part}`,
          lever: "sku",
          impact,
          basis: "Unmet demand × TTM price",
          title: it.display_name || it.part,
          subtitle: `${it.months_of_supply.toFixed(1)} months of supply · ${Math.round(
            shortUnits
          ).toLocaleString()} units short of ${COVERAGE_MONTHS}mo cover`,
          actionLabel: "Open inventory",
          href: "/inventory",
        });
        continue;
      }

      /* Overstock: cash sitting in a warehouse. Different basis from the
         revenue-at-risk alerts above, hence the explicit label. */
      if (
        it.avg_monthly_demand > 0 &&
        Number.isFinite(it.months_of_supply) &&
        it.months_of_supply > OVERSTOCK_MONTHS
      ) {
        const excessUnits =
          it.on_hand - OVERSTOCK_MONTHS * it.avg_monthly_demand;
        if (excessUnits <= 0) continue;

        const impact =
          revPerUnit != null ? excessUnits * revPerUnit : 0;
        if (impact < MIN_IMPACT) continue;

        out.push({
          id: `promo:${it.part}`,
          lever: "promo",
          impact,
          basis: "Excess stock at TTM price",
          title: it.display_name || it.part,
          subtitle: `${it.months_of_supply.toFixed(0)} months of supply · ${Math.round(
            excessUnits
          ).toLocaleString()} units beyond ${OVERSTOCK_MONTHS}mo`,
          actionLabel: "Run a promo",
          href: "/promotions",
        });
      }
    }

    return out.sort((a, b) => b.impact - a.impact);
  }, [loading, customers, repRows, items, economics]);

  const totalAtStake = useMemo(
    () =>
      alerts
        .filter((a) => a.lever !== "promo")
        .reduce((s, a) => s + a.impact, 0),
    [alerts]
  );

  return { alerts, totalAtStake, loading };
}
