"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCustomers } from "./hooks/useCustomers";
import CustomersHeader from "./CustomersHeader";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import { Customer } from "./types";
import { X } from "lucide-react";

type SortDir = "desc" | "asc";

type LastOrderWithItems = {
  id: number; // sales_orders_raw.id is bigint/numeric-ish
  customerid: string | null;
  datecompleted: string | null;
  totalprice: number | null;
  channel: string | null;
  num: string | null;

  items: Array<{
    id: number | null;
    soid: number | null;
    productnum: string | null;
    description: string | null;
    qtyordered: number | null;
    qtyfulfilled: number | null;
    totalprice: number | null;
    typename: string | null;
  }>;
};

function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function CustomersPage() {
  const { customers, loading } = useCustomers();

  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [lastOrder, setLastOrder] = useState<LastOrderWithItems | null>(null);
  const [lastOrderLoading, setLastOrderLoading] = useState(false);
  const [lastOrderError, setLastOrderError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return customers
      .filter((c) => !q || (c.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const dir = sortDir === "desc" ? -1 : 1;
        const av = new Date(a.last_order_date ?? 0).getTime();
        const bv = new Date(b.last_order_date ?? 0).getTime();
        return (av - bv) * dir;
      });
  }, [customers, search, sortDir]);

  async function loadLastOrder(customerId: string, date: string) {
    setLastOrderLoading(true);
    setLastOrderError(null);
    setLastOrder(null);

    // 1) Find the order row (same filter you used before)
    const { data: order, error: orderErr } = await supabase
      .from("sales_orders_raw")
      .select("id, customerid, datecompleted, totalprice, channel, num")
      .eq("customerid", customerId)
      .eq("datecompleted", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) {
      setLastOrderError(orderErr.message);
      setLastOrderLoading(false);
      return;
    }

    if (!order || order.id == null) {
      setLastOrderError("No matching order row found (or order.id is null).");
      setLastOrderLoading(false);
      return;
    }

    // IMPORTANT: so_items_raw.soid links to sales_orders_raw.id
    // soid is numeric; order.id may be number-like already, but keep it explicit.
    const orderId = Number(order.id);

    // 2) Load line items by soid
    const { data: items, error: itemsErr } = await supabase
      .from("so_items_raw")
      .select(
        "id, soid, productnum, description, qtyordered, qtyfulfilled, totalprice, typename"
      )
      .eq("soid", orderId);

    if (itemsErr) {
      setLastOrderError(itemsErr.message);
      setLastOrderLoading(false);
      return;
    }

    setLastOrder({
      id: orderId,
      customerid: order.customerid ?? null,
      datecompleted: order.datecompleted ?? null,
      totalprice: order.totalprice ?? null,
      channel: order.channel ?? null,
      num: order.num ?? null,
      items: items ?? [],
    });

    setLastOrderLoading(false);
  }

  return (
    <div className="px-8 py-10 space-y-10">
    <CustomersHeader />
      <CustomersFilters
        search={search}
        setSearch={setSearch}
        sortDir={sortDir}
        setSortDir={setSortDir}
      />

      {loading ? (
        <div className="text-sm text-slate-400">Loading customers...</div>
      ) : (
        <CustomersTable customers={filtered} onViewLastOrder={loadLastOrder} />
      )}

      {/* Last Order Modal */}
      {(lastOrderLoading || lastOrderError || lastOrder) && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => {
              setLastOrder(null);
              setLastOrderError(null);
              setLastOrderLoading(false);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl border border-slate-200/60 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60">
                <div className="text-sm font-semibold text-slate-800">
                  Last Order Details
                </div>
                <button
                  onClick={() => {
                    setLastOrder(null);
                    setLastOrderError(null);
                    setLastOrderLoading(false);
                  }}
                  className="text-slate-400 hover:text-slate-700 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {lastOrderLoading && (
                  <div className="text-sm text-slate-500">
                    Loading order + items…
                  </div>
                )}

                {lastOrderError && (
                  <div className="text-sm text-red-600">{lastOrderError}</div>
                )}

                {lastOrder && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <MiniStat label="Order ID" value={String(lastOrder.id)} />
                      <MiniStat
                        label="Date"
                        value={
                          lastOrder.datecompleted
                            ? new Date(lastOrder.datecompleted).toLocaleDateString()
                            : "—"
                        }
                      />
                      <MiniStat label="Channel" value={lastOrder.channel ?? "—"} />
                      <MiniStat label="Total" value={formatMoney(lastOrder.totalprice)} />
                    </div>

                    <div className="bg-white/70 rounded-2xl border border-slate-200/60 overflow-hidden">
                      <div className="grid grid-cols-12 px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50/70 border-b border-slate-200/60">
                        <div className="col-span-3">SKU</div>
                        <div className="col-span-5">Description</div>
                        <div className="col-span-2 text-right">Qty</div>
                        <div className="col-span-2 text-right">Line $</div>
                      </div>

                      {lastOrder.items.map((it, idx) => (
                        <div
                          key={`${it.id ?? "x"}-${idx}`}
                          className="grid grid-cols-12 px-5 py-3 text-sm border-b border-slate-100"
                        >
                          <div className="col-span-3 text-xs text-slate-700 truncate">
                            {it.productnum ?? "—"}
                          </div>
                          <div className="col-span-5 text-xs text-slate-600 truncate">
                            {it.description ?? "—"}
                          </div>
                          <div className="col-span-2 text-xs text-slate-700 text-right">
                            {it.qtyfulfilled ?? it.qtyordered ?? 0}
                          </div>
                          <div className="col-span-2 text-xs text-slate-800 font-medium text-right">
                            {formatMoney(it.totalprice)}
                          </div>
                        </div>
                      ))}

                      {lastOrder.items.length === 0 && (
                        <div className="px-5 py-6 text-sm text-slate-400">
                          No items found for this order ID in <code>so_items_raw</code>.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}