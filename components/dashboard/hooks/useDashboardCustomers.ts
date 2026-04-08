"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BrandFilter } from "@/types/brand";

export type CustomerStatus = "active" | "at_risk" | "churned" | "no_orders";

export type CustomerSummaryRow = {
  id: string;
  name: string;
  state: string | null;
  last_order_date: string | null;
  lifetime_revenue: number | null;
  sales_2026: number | null;
  sales_2025: number | null;
  status: CustomerStatus;
};

export type CustomerKPIs = {
  total: number;
  active: number;
  at_risk: number;
  churned: number;
  no_orders: number;
  new_customers: number;
  total_revenue_2026: number;
  avg_revenue_2026: number;
};

function classifyCustomer(lastOrderDate: string | null): CustomerStatus {
  if (!lastOrderDate) return "no_orders";
  const daysSince = Math.floor(
    (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince <= 180) return "active";
  if (daysSince <= 365) return "at_risk";
  return "churned";
}

/**
 * For D2C brand filtering: get the set of product part numbers for a brand,
 * then find which customerids have ordered those products.
 * Uses two small targeted queries instead of fetching all items.
 */
async function getD2CBrandCustomerIds(brand: string): Promise<Set<string>> {
  // Step 1: Get part numbers for this brand (small set — ~50-200 products)
  const { data: products } = await supabase
    .from("inventory_products")
    .select("part")
    .eq("brand", brand);

  if (!products || products.length === 0) return new Set();

  const parts = (products as { part: string }[]).map((p) => p.part);

  // Step 2: Find order item soids that used these parts
  const { data: items } = await supabase
    .from("so_items_raw")
    .select("soid")
    .in("productnum", parts);

  if (!items || items.length === 0) return new Set();

  // Dedupe soids
  const soids = [...new Set((items as { soid: number }[]).map((i) => i.soid))];

  // Step 3: Get customerids for those orders (batch in chunks of 500)
  const customerIds = new Set<string>();
  for (let i = 0; i < soids.length; i += 500) {
    const chunk = soids.slice(i, i + 500);
    const { data: orders } = await supabase
      .from("sales_orders_raw")
      .select("customerid")
      .in("id", chunk);

    for (const o of (orders ?? []) as { customerid: string | null }[]) {
      if (o.customerid) customerIds.add(o.customerid);
    }
  }

  return customerIds;
}

export function useDashboardCustomers(
  brand: BrandFilter,
  mode: "wholesale" | "d2c"
) {
  const [customers, setCustomers] = useState<CustomerSummaryRow[]>([]);
  const [kpis, setKpis] = useState<CustomerKPIs>({
    total: 0,
    active: 0,
    at_risk: 0,
    churned: 0,
    no_orders: 0,
    new_customers: 0,
    total_revenue_2026: 0,
    avg_revenue_2026: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const table =
        mode === "wholesale" ? "customer_summary" : "d2c_customer_summary";
      const idField = mode === "wholesale" ? "customerid" : "person_key";

      // For D2C brand filtering, also fetch customerid to match against order data
      const extraField = brand !== "all" && mode === "d2c" ? ", customerid" : "";

      let query = supabase
        .from(table)
        .select(
          `${idField}, name, bill_to_state, last_order_date, lifetime_revenue, sales_2026, sales_2025${extraField}`
        )
        .order("last_order_date", { ascending: false, nullsFirst: false });

      // Wholesale: filter directly via brands_purchased column
      if (brand !== "all" && mode === "wholesale") {
        query = query.ilike("brands_purchased", `%${brand}%`);
      }

      // Fetch D2C brand filter set in parallel with the main query
      const brandFilterPromise =
        brand !== "all" && mode === "d2c"
          ? getD2CBrandCustomerIds(brand)
          : Promise.resolve(null);

      const [{ data: rows, error }, brandCustIds] = await Promise.all([
        query,
        brandFilterPromise,
      ]);

      if (cancelled || error) {
        if (!cancelled) setLoading(false);
        return;
      }

      let mapped: CustomerSummaryRow[] = (rows ?? []).map((r: any) => ({
        id: r[idField],
        name: r.name,
        state: r.bill_to_state,
        last_order_date: r.last_order_date,
        lifetime_revenue: r.lifetime_revenue,
        sales_2026: r.sales_2026,
        sales_2025: r.sales_2025,
        status: classifyCustomer(r.last_order_date),
        _cid: r.customerid, // temp — for D2C brand filtering
      }));

      // D2C: client-side filter by brand
      if (brandCustIds && brandCustIds.size > 0) {
        mapped = mapped.filter((c: any) => brandCustIds.has(c._cid));
      }

      // Strip temp field
      mapped = mapped.map((c) => {
        const { _cid, ...rest } = c as any;
        return rest as CustomerSummaryRow;
      });

      const k: CustomerKPIs = {
        total: mapped.length,
        active: mapped.filter((c) => c.status === "active").length,
        at_risk: mapped.filter((c) => c.status === "at_risk").length,
        churned: mapped.filter((c) => c.status === "churned").length,
        no_orders: mapped.filter((c) => c.status === "no_orders").length,
        new_customers: mapped.filter(
          (c) => (c.sales_2026 ?? 0) > 0 && !(c.sales_2025 ?? 0)
        ).length,
        total_revenue_2026: mapped.reduce(
          (s, c) => s + (c.sales_2026 ?? 0),
          0
        ),
        avg_revenue_2026: 0,
      };
      const paying2026 = mapped.filter((c) => (c.sales_2026 ?? 0) > 0).length;
      k.avg_revenue_2026 = paying2026 > 0 ? k.total_revenue_2026 / paying2026 : 0;

      setCustomers(mapped);
      setKpis(k);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brand, mode]);

  return { customers, kpis, loading };
}
