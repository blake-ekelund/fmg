"use client";

import { Fragment } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Loader2,
  Receipt,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Order } from "../../types";
import { formatDate, formatMoney } from "../utils/format";
import { supabase } from "@/lib/supabaseClient";
import { stageOf, type OrderStage } from "@/lib/orderStage";
import type { OrderSortKey } from "../hooks/useCustomerOrders";

type LineItem = {
  sku?: string;
  description?: string;
  quantity?: number;
  price?: number;
};

/** Sortable table columns, in display order. Mirrors the storefront purchases
 *  table so an order reads the same wherever you meet it. Items isn't sortable:
 *  units are counted per page, so the DB can't order on them. */
const COLUMNS: {
  key: OrderSortKey | "items";
  label: string;
  align?: "right";
  sortable?: boolean;
}[] = [
  { key: "order", label: "Order", sortable: true },
  { key: "placed", label: "Placed", sortable: true },
  { key: "completed", label: "Completed", sortable: true },
  { key: "channel", label: "Channel", sortable: true },
  { key: "items", label: "Items", align: "right" },
  { key: "total", label: "Total", align: "right", sortable: true },
  { key: "status", label: "Status", sortable: true },
];

const COL_COUNT = COLUMNS.length + 1; // + the expand chevron

/** Label + pill colours per collapsed Fishbowl stage. */
const STAGE_BADGE: Record<OrderStage, { label: string; badge: string }> = {
  estimate: { label: "Estimate", badge: "bg-amber-50 text-amber-700" },
  open: { label: "Open", badge: "bg-sky-50 text-sky-700" },
  completed: { label: "Completed", badge: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", badge: "bg-gray-100 text-gray-500" },
};

/** The order number a human would quote — Fishbowl's `num`, else the row id. */
function orderRef(o: Order) {
  return o.num ? String(o.num) : `#${o.id}`;
}

export default function OrdersTab({
  orders,
  ordersLoading,
  expandedOrder,
  toggleOrder,
  getItemMeta,
  sortKey,
  sortDir,
  onSort,
  page,
  pageCount,
  totalCount,
  pageSize,
  onPageChange,
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
  sortKey: OrderSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: OrderSortKey) => void;
  page: number;
  pageCount: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
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

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  if (ordersLoading && orders.length === 0) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
        <Loader2 size={15} className="animate-spin" /> Loading orders…
      </div>
    );
  }

  if (!ordersLoading && orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
        <Receipt size={24} className="mx-auto text-gray-300" />
        <h2 className="mt-3 text-sm font-medium text-gray-900">No orders yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          Once this customer has an order in Fishbowl it shows up here — order
          number, dates, units, total, and status.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ================= TOP ACTION BAR ================= */}
      <div className="flex items-center gap-3">
        {ordersLoading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </span>
        ) : null}
        <button
          onClick={downloadAllOrders}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <Download size={13} />
          Download this page
        </button>
      </div>

      {/* ================= TABLE ================= */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
              {COLUMNS.map((col) => {
                const active = col.sortable && sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className={`px-3 py-2.5 font-medium ${col.align === "right" ? "text-right" : ""}`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.key as OrderSortKey)}
                        title={`Sort by ${col.label}`}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider ${
                          col.align === "right" ? "flex-row-reverse" : ""
                        } ${active ? "text-gray-700" : "hover:text-gray-600"}`}
                      >
                        {col.label}
                        {active ? (
                          sortDir === "asc" ? (
                            <ChevronUp size={11} />
                          ) : (
                            <ChevronDown size={11} />
                          )
                        ) : (
                          <ArrowUpDown size={11} className="opacity-30" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
              <th className="w-8 px-3 py-2.5" />
            </tr>
          </thead>

          <tbody>
            {orders.map((o) => {
              const id = String(o.id);
              const isOpen = expandedOrder === id;
              const meta = getItemMeta(id);
              const items = o.items ?? [];
              const wholesale = o.channel === "wholesale";
              const stage = STAGE_BADGE[stageOf(o.status)];

              return (
                <Fragment key={id}>
                  <tr
                    onClick={() => toggleOrder(id)}
                    className={`cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
                      isOpen ? "bg-gray-50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-gray-900">
                      {orderRef(o)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                      {formatDate(o.dateissued ?? null)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                      {formatDate(o.datecompleted)}
                    </td>

                    <td className="px-3 py-2.5">
                      {o.channel ? (
                        <span
                          className={
                            wholesale
                              ? "inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                              : "inline-flex rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700"
                          }
                        >
                          {o.channel}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                      {o.units ?? "—"}
                    </td>

                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                      {formatMoney(o.totalprice)}
                    </td>

                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${stage.badge}`}
                      >
                        {stage.label}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-right text-gray-400">
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </td>
                  </tr>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <tr>
                        <td colSpan={COL_COUNT} className="p-0">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="border-l-4 border-accent-gold bg-gray-50 px-4 py-4">

                              <div className="mb-3 flex items-center justify-between">
                                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                                  Line items
                                  {meta.count ? (
                                    <span className="ml-1.5 tabular-nums text-gray-400">
                                      ({meta.count})
                                    </span>
                                  ) : null}
                                  {o.shiptocity || o.shiptostate ? (
                                    <span className="ml-3 normal-case tracking-normal text-gray-400">
                                      Ship to{" "}
                                      {[o.shiptocity, o.shiptostate]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </span>
                                  ) : null}
                                </div>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadOrder(o);
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-900"
                                >
                                  <Download size={12} />
                                  Download
                                </button>
                              </div>

                              {meta.loading ? (
                                <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
                                  <Loader2 size={13} className="animate-spin" />{" "}
                                  Loading items…
                                </div>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                                        <th className="px-3 py-2 font-medium">SKU</th>
                                        <th className="px-3 py-2 font-medium">
                                          Description
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium">
                                          Qty
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium">
                                          Line total
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((it, idx) => (
                                        <tr
                                          key={`${it.sku ?? "x"}-${idx}`}
                                          className="border-b border-gray-50 last:border-0"
                                        >
                                          <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-900">
                                            {it.sku ?? "—"}
                                          </td>
                                          <td className="px-3 py-2 text-gray-500">
                                            {it.description ?? "—"}
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                            {it.quantity ?? 0}
                                          </td>
                                          <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">
                                            {formatMoney(it.price)}
                                          </td>
                                        </tr>
                                      ))}

                                      {items.length === 0 && (
                                        <tr>
                                          <td
                                            colSpan={4}
                                            className="px-3 py-6 text-center text-gray-400"
                                          >
                                            No line items found.
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
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

      {/* ================= PAGINATION ================= */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {totalCount === 0
            ? "No orders"
            : `Showing ${from}–${to} of ${totalCount}`}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="px-1">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              disabled={page >= pageCount}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
