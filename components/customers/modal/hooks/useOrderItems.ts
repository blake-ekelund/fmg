// /modal/hooks/useOrderItems.ts
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Order } from "../../types"; // adjust path

const ITEM_PAGE_SIZE = 15;

export default function useOrderItems(opts: {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}) {
  const { setOrders } = opts;

  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [itemPages, setItemPages] = useState<Record<string, number>>({});
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [itemLoading, setItemLoading] = useState<Record<string, boolean>>({});

  function reset() {
    setExpandedOrder(null);
    setItemPages({});
    setItemCounts({});
    setItemLoading({});
  }

  async function loadItems(orderId: string, page: number = 1) {
    const from = (page - 1) * ITEM_PAGE_SIZE;
    const to = from + ITEM_PAGE_SIZE - 1;

    setItemLoading((p) => ({ ...p, [orderId]: true }));

    const { data, count } = await supabase
      .from("so_items_raw")
      .select("productnum, description, qtyfulfilled, qtyordered, totalprice", {
        count: "exact",
      })
      .eq("soid", Number(orderId))
      .range(from, to);

    setOrders((prev) =>
      prev.map((o: any) =>
        o.id === orderId
          ? {
              ...o,
              items:
                data?.map((i) => ({
                  sku: i.productnum,
                  description: i.description,
                  quantity: i.qtyfulfilled ?? i.qtyordered ?? 0,
                  price: i.totalprice,
                })) ?? [],
            }
          : o
      )
    );

    setItemPages((p) => ({ ...p, [orderId]: page }));
    setItemCounts((p) => ({ ...p, [orderId]: count ?? 0 }));
    setExpandedOrder(orderId);
    setItemLoading((p) => ({ ...p, [orderId]: false }));
  }

  function toggleOrder(orderId: string) {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      return;
    }
    loadItems(orderId, 1);
  }

  function getItemMeta(orderId: string) {
    const page = itemPages[orderId] ?? 1;
    const count = itemCounts[orderId] ?? 0;
    const totalPages = Math.max(1, Math.ceil(count / ITEM_PAGE_SIZE));
    const loading = !!itemLoading[orderId];
    return { page, count, totalPages, loading };
  }

  return {
    expandedOrder,
    reset,
    loadItems,
    toggleOrder,
    getItemMeta,
  };
}