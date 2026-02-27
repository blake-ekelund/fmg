"use client";

import { Fragment } from "react";
import { ChevronDown, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Order } from "../../types";
import { formatDate, formatMoney } from "../utils/format";
import { supabase } from "@/lib/supabaseClient";

type LineItem = {
  sku?: string;
  description?: string;
  quantity?: number;
  price?: number;
};

export default function OrdersTab({
  orders,
  ordersLoading,
  expandedOrder,
  toggleOrder,
  getItemMeta,
}: {
  orders: (Order & { items?: LineItem[] })[];
  ordersLoading: boolean;
  expandedOrder: string | null;
  toggleOrder: (orderId: string) => void;
  getItemMeta: (orderId: string) => {
    page: number;
    count: number;
    totalPages: number;
    loading: boolean;
  };
}) {

  function buildCSV(rows: (string | number)[][]) {
    return rows
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
  }

  function downloadBlob(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadOrder(order: Order & { items?: LineItem[] }) {
    const items = order.items ?? [];
    if (!items.length) return;

    const headers = [
      "Order ID",
      "Order Date",
      "Channel",
      "Order Total",
      "SKU",
      "Description",
      "Quantity",
      "Line Total",
    ];

    const rows = items.map((it) => [
      order.id,
      formatDate(order.datecompleted),
      order.channel ?? "",
      order.totalprice ?? 0,
      it.sku ?? "",
      it.description ?? "",
      it.quantity ?? 0,
      it.price ?? 0,
    ]);

    const csv = buildCSV([headers, ...rows]);
    downloadBlob(`order-${order.id}.csv`, csv);
  }

async function downloadAllOrders() {
  if (!orders.length) return;

  const orderIds = orders.map((o) => Number(o.id));

  // Fetch all items for all loaded orders
  const { data: itemsData } = await supabase
    .from("so_items_raw")
    .select(
      "soid, productnum, description, qtyfulfilled, qtyordered, totalprice"
    )
    .in("soid", orderIds);

  const headers = [
    "Order ID",
    "Order Date",
    "Channel",
    "Order Total",
    "SKU",
    "Description",
    "Quantity",
    "Line Total",
  ];

  const rows: (string | number)[][] = [];

  orders.forEach((order) => {
    const orderItems =
      itemsData?.filter((i) => i.soid === Number(order.id)) ?? [];

    if (!orderItems.length) {
      rows.push([
        order.id,
        formatDate(order.datecompleted),
        order.channel ?? "",
        order.totalprice ?? 0,
        "",
        "",
        "",
        "",
      ]);
    } else {
      orderItems.forEach((it) => {
        rows.push([
          order.id,
          formatDate(order.datecompleted),
          order.channel ?? "",
          order.totalprice ?? 0,
          it.productnum ?? "",
          it.description ?? "",
          it.qtyfulfilled ?? it.qtyordered ?? 0,
          it.totalprice ?? 0,
        ]);
      });
    }
  });

  const csv = buildCSV([headers, ...rows]);
  downloadBlob("all-orders.csv", csv);
}

  return (
    <div className="h-full overflow-y-auto">

      {/* ================= TOP ACTION BAR ================= */}
      <div className="flex justify-end mb-4">
        <button
          onClick={downloadAllOrders}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
        >
          <Download size={14} />
          Download All Orders
        </button>
      </div>

      {ordersLoading && (
        <div className="text-sm text-slate-400 mb-4">
          Loading orders...
        </div>
      )}

      <table className="w-full border-separate border-spacing-0 text-sm">

        {/* ================= STICKY HEADER ================= */}
        <thead className="sticky top-0 z-10 bg-white shadow-xs">
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="py-3 px-4">Order</th>
            <th className="py-3 px-4">Date</th>
            <th className="py-3 px-4">Channel</th>
            <th className="py-3 px-4 text-right">Total</th>
            <th className="py-3 px-4 w-10"></th>
          </tr>
        </thead>

        <tbody>

          {orders.map((o) => {
            const id = String(o.id);
            const isOpen = expandedOrder === id;
            const meta = getItemMeta(id);
            const items = o.items ?? [];

            return (
              <Fragment key={id}>

                <tr
                  className={`border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer ${
                    isOpen ? "bg-slate-50" : ""
                  }`}
                  onClick={() => toggleOrder(id)}
                >
                  <td className="py-3 px-4 font-medium text-slate-900">
                    #{id}
                  </td>

                  <td className="py-3 px-4 text-slate-600">
                    {formatDate(o.datecompleted)}
                  </td>

                  <td className="py-3 px-4 text-slate-600">
                    {o.channel ?? "—"}
                  </td>

                  <td className="py-3 px-4 text-right font-semibold text-slate-900">
                    {formatMoney(o.totalprice)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </td>
                </tr>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="border-l-4 border-[#ebb700] bg-slate-50 px-4 py-6">

                            <div className="flex items-center justify-between mb-4">
                              <div className="text-sm font-medium text-slate-700">
                                Line Items
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadOrder(o);
                                }}
                                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
                              >
                                <Download size={14} />
                                Download
                              </button>
                            </div>

                            {meta.loading && (
                              <div className="text-sm text-slate-400">
                                Loading items...
                              </div>
                            )}

                            {!meta.loading && (
                              <table className="w-full text-xs bg-white rounded-lg overflow-hidden">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-100">
                                    <th className="py-2 px-3">SKU</th>
                                    <th className="py-2 px-3">Description</th>
                                    <th className="py-2 px-3 text-right">Qty</th>
                                    <th className="py-2 px-3 text-right">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((it, idx) => (
                                    <tr
                                      key={`${it.sku ?? "x"}-${idx}`}
                                      className="border-b border-slate-100 last:border-none"
                                    >
                                      <td className="py-2 px-3">{it.sku ?? "—"}</td>
                                      <td className="py-2 px-3">{it.description ?? "—"}</td>
                                      <td className="py-2 px-3 text-right">
                                        {it.quantity ?? 0}
                                      </td>
                                      <td className="py-2 px-3 text-right font-medium">
                                        {formatMoney(it.price)}
                                      </td>
                                    </tr>
                                  ))}

                                  {items.length === 0 && (
                                    <tr>
                                      <td colSpan={4} className="py-6 text-slate-400 px-3">
                                        No line items found.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}

                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </AnimatePresence>

              </Fragment>
            );
          })}

        </tbody>
      </table>
    </div>
  );
}