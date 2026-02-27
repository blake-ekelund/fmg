// /modal/hooks/useCustomerOrders.ts
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Order } from "../../types"; // adjust if your types live elsewhere

const ORDER_PAGE_SIZE = 15;

export default function useCustomerOrders(
  customerId: string | null,
  enabled: boolean
) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    setOrders([]);
    setOrderPage(1);
    setTotalCount(0);
    setLoading(false);
  }, [customerId, enabled]);

  useEffect(() => {
    if (!customerId || !enabled) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const from = (orderPage - 1) * ORDER_PAGE_SIZE;
      const to = from + ORDER_PAGE_SIZE - 1;

      const { data, count } = await supabase
        .from("sales_orders_raw")
        .select("id, datecompleted, totalprice, channel", { count: "exact" })
        .eq("customerid", customerId)
        .order("datecompleted", { ascending: false })
        .range(from, to);

      if (!cancelled) {
        setOrders((data ?? []) as any);
        setTotalCount(count ?? 0);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [customerId, enabled, orderPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / ORDER_PAGE_SIZE));

  return {
    orders,
    setOrders,
    loading,
    orderPage,
    setOrderPage,
    totalCount,
    totalPages,
  };
}