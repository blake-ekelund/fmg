"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Order } from "./types";
import { X } from "lucide-react";

function formatMoney(n: number) {
  return n?.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }) ?? "$0";
}

export default function CustomerOrdersModal({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!customerId) return;

    async function load() {
      const { data } = await supabase
        .from("sales_orders_raw")
        .select("id, datecompleted, totalprice, channel")
        .eq("customerid", customerId)
        .order("datecompleted", { ascending: false });

      setOrders(data ?? []);
    }

    load();
  }, [customerId]);

  if (!customerId) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-xl p-6">
          <div className="flex justify-between mb-4">
            <div className="font-semibold">Customer Orders</div>
            <button onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          {orders.map((o) => (
            <div key={o.id} className="flex justify-between py-2 border-b">
              <div>{o.datecompleted}</div>
              <div>{o.channel}</div>
              <div>{formatMoney(o.totalprice)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}