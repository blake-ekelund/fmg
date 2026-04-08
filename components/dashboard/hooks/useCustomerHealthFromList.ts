"use client";

import { useMemo } from "react";
import type { CustomerSummaryRow } from "./useDashboardCustomers";
import type { HealthRow, HealthKPIs } from "./useDashboardCustomerHealth";

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Compute monthly customer health trends (new, at-risk, churned)
 * directly from a channel-specific customer list.
 *
 * Logic per customer:
 * - "new" in month M = their first order was in month M
 *   (approximated: sales_2026 > 0 && sales_2025 === 0 → new in 2026,
 *    placed in the month of their last_order_date for simplicity)
 * - "churned" as of month M = last_order_date was exactly 12 months before M
 * - "at_risk" as of month M = last_order_date was 6-12 months before M
 *
 * We bucket each customer's last_order_date into a "became churned" month
 * (12 months after last order) and "became at risk" month (6 months after).
 */
export function useCustomerHealthFromList(
  customers: CustomerSummaryRow[],
  loading: boolean
): { data: HealthRow[]; kpis: HealthKPIs } {
  return useMemo(() => {
    if (loading || customers.length === 0) {
      return {
        data: [],
        kpis: {
          new_ttm: 0, at_risk_ttm: 0, churned_ttm: 0,
          reactivated_churned_ttm: 0, reactivated_at_risk_ttm: 0, reorders_ttm: 0,
          new_latest: 0, at_risk_latest: 0, churned_latest: 0,
          reactivated_churned_latest: 0, reactivated_at_risk_latest: 0, reorders_latest: 0,
        },
      };
    }

    // Build 12 monthly buckets ending at current month
    const now = new Date();
    const buckets: { year: number; month: number; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth(); // 0-based
      buckets.push({
        year: y,
        month: m,
        label: `${SHORT_MONTHS[m]} '${String(y).slice(2)}`,
      });
    }

    // Initialize counters
    const monthly: Record<string, { new_c: number; at_risk: number; churned: number }> = {};
    for (const b of buckets) {
      monthly[b.label] = { new_c: 0, at_risk: 0, churned: 0 };
    }

    for (const c of customers) {
      if (!c.last_order_date) continue;

      const lastOrder = new Date(c.last_order_date + "T00:00:00");

      // "Became at-risk" = 6 months after last order
      const atRiskDate = new Date(lastOrder);
      atRiskDate.setMonth(atRiskDate.getMonth() + 6);

      // "Became churned" = 12 months after last order
      const churnedDate = new Date(lastOrder);
      churnedDate.setMonth(churnedDate.getMonth() + 12);

      // Bucket the at-risk event
      const arKey = `${SHORT_MONTHS[atRiskDate.getMonth()]} '${String(atRiskDate.getFullYear()).slice(2)}`;
      if (monthly[arKey]) {
        monthly[arKey].at_risk++;
      }

      // Bucket the churned event
      const chKey = `${SHORT_MONTHS[churnedDate.getMonth()]} '${String(churnedDate.getFullYear()).slice(2)}`;
      if (monthly[chKey]) {
        monthly[chKey].churned++;
      }

      // "New" customer: first order date approximation
      // If they have 2026 sales but no 2025 sales, they're new in 2026
      // Place them in the month of their last_order_date (rough proxy for first order)
      const isNew = (c.sales_2026 ?? 0) > 0 && !(c.sales_2025 ?? 0);
      if (isNew) {
        const newKey = `${SHORT_MONTHS[lastOrder.getMonth()]} '${String(lastOrder.getFullYear()).slice(2)}`;
        if (monthly[newKey]) {
          monthly[newKey].new_c++;
        }
      }
    }

    const data: HealthRow[] = buckets.map((b) => {
      const m = monthly[b.label];
      return {
        month: b.label,
        new_customers: m.new_c,
        newly_at_risk: m.at_risk,
        newly_churned: m.churned,
        reactivated_from_churned: 0,
        reactivated_from_at_risk: 0,
        reorders: 0,
      };
    });

    const sum = (key: keyof HealthRow) =>
      data.reduce((s, r) => s + (Number(r[key]) || 0), 0);

    const latest = data[data.length - 1];

    const kpis: HealthKPIs = {
      new_ttm: sum("new_customers"),
      at_risk_ttm: sum("newly_at_risk"),
      churned_ttm: sum("newly_churned"),
      reactivated_churned_ttm: 0,
      reactivated_at_risk_ttm: 0,
      reorders_ttm: 0,
      new_latest: latest?.new_customers ?? 0,
      at_risk_latest: latest?.newly_at_risk ?? 0,
      churned_latest: latest?.newly_churned ?? 0,
      reactivated_churned_latest: 0,
      reactivated_at_risk_latest: 0,
      reorders_latest: 0,
    };

    return { data, kpis };
  }, [customers, loading]);
}
