// /modal/tabs/OrdersTab.tsx
"use client";

import { ChevronDown } from "lucide-react";
import { Order } from "../../types"; // adjust path
import { formatDate, formatMoney } from "../utils/format";

export default function OrdersTab({
  orders,
  ordersLoading,
  orderPage,
  setOrderPage,
  orderTotalPages,
  expandedOrder,
  toggleOrder,
  getItemMeta,
  loadItems,
}: {
  orders: Order[];
  ordersLoading: boolean;
  orderPage: number;
  setOrderPage: (n: number) => void;
  orderTotalPages: number;
  expandedOrder: string | null;
  toggleOrder: (orderId: string) => void;
  getItemMeta: (orderId: string) => {
    page: number;
    count: number;
    totalPages: number;
    loading: boolean;
  };
  loadItems: (orderId: string, page: number) => Promise<void>;
}) {
  return (
    <div className="h-full overflow-hidden">
      {ordersLoading && (
        <div className="text-sm text-slate-400 mb-4">Loading orders...</div>
      )}

      <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50/70 border border-slate-200/60 rounded-2xl">
        <div className="col-span-3">Order</div>
        <div className="col-span-3">Date</div>
        <div className="col-span-3">Channel</div>
        <div className="col-span-2 text-right">Total</div>
        <div className="col-span-1" />
      </div>

      <div className="mt-3 h-[calc(100%-92px)] overflow-y-auto pr-2 space-y-2">
        {orders.length === 0 && !ordersLoading && (
          <div className="py-10 text-center text-sm text-slate-400">
            No orders found.
          </div>
        )}

        {orders.map((o) => {
          const isOpen = expandedOrder === (o as any).id;
          const id = String((o as any).id);
          const meta = getItemMeta(id);

          return (
            <div
              key={id}
              className="rounded-2xl border border-slate-200/60 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleOrder(id)}
                className="w-full text-left"
              >
                <div className="grid grid-cols-12 items-center px-4 py-3 hover:bg-slate-50/60 transition">
                  <div className="col-span-3 font-medium">#{id}</div>
                  <div className="col-span-3">
                    {formatDate((o as any).datecompleted)}
                  </div>
                  <div className="col-span-3 truncate">
                    {(o as any).channel ?? "—"}
                  </div>
                  <div className="col-span-2 text-right font-semibold">
                    {formatMoney((o as any).totalprice)}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200/60">
                  <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50/60">
                    <div className="col-span-3">SKU</div>
                    <div className="col-span-6">Description</div>
                    <div className="col-span-1 text-right">Qty</div>
                    <div className="col-span-2 text-right">Line $</div>
                  </div>

                  {meta.loading && (
                    <div className="px-4 py-3 text-sm text-slate-400">
                      Loading items...
                    </div>
                  )}

                  <div className="divide-y divide-slate-100">
                    {(((o as any).items ?? []) as any[]).map((it, idx) => (
                      <div
                        key={`${it.sku ?? "x"}-${idx}`}
                        className="grid grid-cols-12 px-4 py-2 text-sm"
                      >
                        <div className="col-span-3 truncate">{it.sku ?? "—"}</div>
                        <div className="col-span-6 truncate">
                          {it.description ?? "—"}
                        </div>
                        <div className="col-span-1 text-right">
                          {it.quantity ?? 0}
                        </div>
                        <div className="col-span-2 text-right font-medium">
                          {formatMoney(it.price)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {meta.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="text-slate-500">
                        Items page {meta.page} / {meta.totalPages}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                          disabled={meta.page <= 1 || meta.loading}
                          onClick={() => loadItems(id, meta.page - 1)}
                        >
                          Prev
                        </button>
                        <button
                          className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                          disabled={meta.page >= meta.totalPages || meta.loading}
                          onClick={() => loadItems(id, meta.page + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {orderTotalPages > 1 && (
        <div className="mt-3 flex items-center justify-between px-2 text-sm">
          <div className="text-slate-500">
            Orders page {orderPage} / {orderTotalPages}
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              disabled={orderPage <= 1}
              onClick={() => setOrderPage(orderPage - 1)}
            >
              Prev
            </button>
            <button
              className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              disabled={orderPage >= orderTotalPages}
              onClick={() => setOrderPage(orderPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}