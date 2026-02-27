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
  enabled: boolean = true
) {
  const [monthlyData, setMonthlyData] = useState<CustomerMonthlyRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!customerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("customer_monthly_orders")
        .select("month_key, month_date, orders, revenue")
        .eq("customerid", String(customerId))
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
  }, [customerId, enabled]);

  return { monthlyData, loading };
}