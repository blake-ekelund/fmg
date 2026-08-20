// /modal/hooks/useCustomerOrders.ts
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Order } from "../../types"; // adjust if your types live elsewhere

export const ORDER_PAGE_SIZE = 25;

/** Sortable columns, mapped to the `sales_orders_raw` column they sort on.
 *  Sorting is done server-side because the list is paginated — sorting only
 *  the 25 rows in hand would silently reorder a slice, not the history. */
export type OrderSortKey =
  | "order"
  | "placed"
  | "completed"
  | "channel"
  | "total"
  | "status";

const SORT_COLUMN: Record<OrderSortKey, string> = {
  order: "id",
  placed: "dateissued",
  completed: "datecompleted",
  channel: "channel",
  total: "totalprice",
  status: "status",
};

const SELECT_COLS =
  "id, num, status, dateissued, datecompleted, totalprice, channel, shiptocity, shiptostate";

export default function useCustomerOrders(
  customerId: string | null,
  enabled: boolean,
  isD2C = false,
  sort: { key: OrderSortKey; dir: "asc" | "desc" } = {
    key: "completed",
    dir: "desc",
  }
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

      const ascending = sort.dir === "asc";
      // nullsFirst:false keeps rows with no date (open orders, estimates) out
      // of the lead position when sorting newest-first.
      const orderOpts = { ascending, nullsFirst: false } as const;

      let query;
      if (isD2C) {
        // For D2C, person_key = COALESCE(NULLIF(TRIM(email),''), billtoname)
        // We need to use an RPC or filter by email/billtoname
        // Use .or() to match either email or billtoname = person_key
        query = supabase
          .from("sales_orders_raw")
          .select(SELECT_COLS, { count: "exact" })
          .in("customerid", ["12345", "12483", "13704"])
          .or(`email.eq.${customerId},billtoname.eq.${customerId}`);
      } else {
        query = supabase
          .from("sales_orders_raw")
          .select(SELECT_COLS, { count: "exact" })
          .eq("customerid", customerId);
      }

      const { data, count } = await query
        .order(SORT_COLUMN[sort.key], orderOpts)
        // Tiebreak on id so equal dates/totals don't shuffle between pages.
        .order("id", { ascending: false })
        .range(from, to);

      if (cancelled) return;

      const rows = (data ?? []) as Order[];
      setOrders(rows);
      setTotalCount(count ?? 0);
      setLoading(false);

      // Unit counts for the Items column. One extra query per page, and
      // non-fatal: on failure the column just reads "—".
      const ids = rows.map((o) => Number(o.id)).filter((n) => !Number.isNaN(n));
      if (!ids.length) return;

      const { data: itemRows } = await supabase
        .from("so_items_raw")
        .select("soid, qtyfulfilled, qtyordered")
        .in("soid", ids);

      if (cancelled || !itemRows) return;

      const units = new Map<number, number>();
      for (const r of itemRows as {
        soid: number;
        qtyfulfilled: number | null;
        qtyordered: number | null;
      }[]) {
        units.set(
          r.soid,
          (units.get(r.soid) ?? 0) + (r.qtyfulfilled ?? r.qtyordered ?? 0)
        );
      }

      setOrders((prev) =>
        prev.map((o) =>
          units.has(Number(o.id)) ? { ...o, units: units.get(Number(o.id)) } : o
        )
      );
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [customerId, enabled, orderPage, isD2C, sort.key, sort.dir]);

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
