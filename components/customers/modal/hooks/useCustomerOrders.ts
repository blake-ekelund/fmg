// /modal/hooks/useCustomerOrders.ts
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Order } from "../../types"; // adjust if your types live elsewhere

const ORDER_PAGE_SIZE = 25;

export default function useCustomerOrders(
  customerId: string | null,
  enabled: boolean,
  isD2C = false
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

      if (isD2C) {
        // For D2C, person_key = COALESCE(NULLIF(TRIM(email),''), billtoname)
        // We need to use an RPC or filter by email/billtoname
        // Use .or() to match either email or billtoname = person_key
        const { data, count } = await supabase
          .from("sales_orders_raw")
          .select("id, datecompleted, totalprice, channel", { count: "exact" })
          .in("customerid", ["12345", "12483", "13704"])
          .or(`email.eq.${customerId},billtoname.eq.${customerId}`)
          .order("datecompleted", { ascending: false })
          .range(from, to);

        if (!cancelled) {
          setOrders((data ?? []) as Order[]);
          setTotalCount(count ?? 0);
          setLoading(false);
        }
      } else {
        const { data, count } = await supabase
          .from("sales_orders_raw")
          .select("id, datecompleted, totalprice, channel", { count: "exact" })
          .eq("customerid", customerId)
          .order("datecompleted", { ascending: false })
          .range(from, to);

        if (!cancelled) {
          setOrders((data ?? []) as Order[]);
          setTotalCount(count ?? 0);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [customerId, enabled, orderPage, isD2C]);

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
