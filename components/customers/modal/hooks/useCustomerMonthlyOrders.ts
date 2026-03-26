"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type CustomerMonthlyRow = {
  month_key: string;
  month_date: string;
  orders: number;
  revenue: number;
};

export default function useCustomerMonthlyOrders(
  customerId: string | null,
  enabled: boolean = true,
  isD2C = false
) {
  const [monthlyData, setMonthlyData] = useState<CustomerMonthlyRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!customerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const table = isD2C ? "d2c_customer_monthly_orders" : "customer_monthly_orders";
      const filterField = isD2C ? "person_key" : "customerid";

      const { data, error } = await supabase
        .from(table)
        .select("month_key, month_date, orders, revenue")
        .eq(filterField, String(customerId))
        .order("month_date", { ascending: true });

      if (!cancelled) {
        if (error) {
          console.error("useCustomerMonthlyOrders error:", error);
          setMonthlyData([]);
        } else {
          setMonthlyData((data ?? []) as CustomerMonthlyRow[]);
        }
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [customerId, enabled, isD2C]);

  return { monthlyData, loading };
}
