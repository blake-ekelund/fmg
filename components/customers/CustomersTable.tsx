"use client";

import { Customer } from "./types";
import { Globe, Truck, Store, ShoppingCart } from "lucide-react";

function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function getChannelIcon(channel: string) {
  switch ((channel ?? "").toLowerCase()) {
    case "online":
    case "shopify":
      return <ShoppingCart size={14} />;
    case "wholesale":
      return <Truck size={14} />;
    case "retail":
      return <Store size={14} />;
    default:
      return <Globe size={14} />;
  }
}

export default function CustomersTable({
  customers,
  onViewLastOrder,
}: {
  customers: Customer[];
  onViewLastOrder: (customerId: string, date: string) => void;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-11 px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50/70 border-b border-slate-200/60">
        <div className="col-span-2">Customer</div>
        <div>Channel</div>
        <div>State</div>
        <div>Last Order</div>
        <div>Last $</div>
        <div>2023</div>
        <div>2024</div>
        <div>2025</div>
        <div>2026</div>
        <div className="text-right col-span-2">Actions</div>
      </div>

      {/* Rows */}
      {customers.map((c) => (
        <div
          key={c.customerid}
          className="grid grid-cols-11 px-5 py-3 text-sm items-center border-b border-slate-100 hover:bg-slate-50/60 transition"
        >
          {/* Name */}
          <div className="col-span-2 flex flex-col min-w-0">
            <div className="font-medium text-slate-800 truncate">{c.name}</div>
            <div className="text-[11px] text-slate-400 truncate">{c.customerid}</div>
          </div>

          {/* Channel */}
          <div className="flex items-center gap-2 text-slate-600">
            {getChannelIcon(c.channel)}
            <span className="text-xs truncate">{c.channel}</span>
          </div>

          {/* State */}
          <div className="text-slate-600 text-xs">{c.bill_to_state ?? "—"}</div>

          {/* Last Order Date (CLICKABLE) */}
          <div className="text-xs text-slate-600">
            {c.last_order_date ? (
              <button
                onClick={() => onViewLastOrder(c.customerid, c.last_order_date)}
                className="text-slate-700 hover:text-[#ebb700] transition underline-offset-2 hover:underline"
                title="View last order line items"
              >
                {formatDate(c.last_order_date)}
              </button>
            ) : (
              "—"
            )}
          </div>

          {/* Last Order Amount */}
          <div className="text-xs font-medium text-slate-700">
            {formatMoney(c.last_order_amount)}
          </div>

          {/* Yearly Sales */}
          <div className="text-xs text-slate-600">{formatMoney(c.sales_2023)}</div>
          <div className="text-xs text-slate-600">{formatMoney(c.sales_2024)}</div>
          <div className="text-xs text-slate-600">{formatMoney(c.sales_2025)}</div>
          <div className="text-xs font-semibold text-slate-800">{formatMoney(c.sales_2026)}</div>

          {/* Actions placeholder */}
          <div className="col-span-2 text-right text-xs text-slate-400">—</div>
        </div>
      ))}

      {/* Empty State */}
      {customers.length === 0 && (
        <div className="px-6 py-8 text-center text-sm text-slate-400">
          No customers found.
        </div>
      )}
    </div>
  );
}