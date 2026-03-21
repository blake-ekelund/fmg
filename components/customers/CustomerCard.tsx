"use client";

import { useRouter } from "next/navigation";
import { Customer } from "./types";

function formatMoney(n: number | null | undefined) {
  if (n == null) return "--";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(d: string | null) {
  if (!d) return "--";
  return new Date(d).toLocaleDateString();
}

function getCustomerStatus(lastOrderDate: string | null) {
  if (!lastOrderDate) {
    return { label: "No Orders", color: "bg-slate-100 text-slate-600" };
  }

  const now = new Date();
  const last = new Date(lastOrderDate);
  const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays <= 180)
    return { label: "Active", color: "bg-emerald-50 text-emerald-700" };
  if (diffDays <= 365)
    return { label: "At Risk", color: "bg-amber-50 text-amber-700" };
  return { label: "Churned", color: "bg-rose-50 text-rose-700" };
}

export default function CustomerCard({ customer }: { customer: Customer }) {
  const router = useRouter();
  const status = getCustomerStatus(customer.last_order_date);

  const ttmRevenue =
    customer.sales_2026 ?? customer.sales_2025 ?? customer.sales_2024 ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() =>
        router.push(`/customers/${encodeURIComponent(customer.customerid)}`)
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          router.push(
            `/customers/${encodeURIComponent(customer.customerid)}`
          );
        }
      }}
      className="rounded-xl border border-gray-200 bg-white/70 backdrop-blur-sm p-4 hover:shadow-md hover:border-gray-300 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-gray-300"
    >
      {/* Top row: name + badges */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">
            {customer.name}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {customer.customerid}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${status.color}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Channel + State row */}
      <div className="flex items-center gap-2 mb-3">
        {customer.channel && (
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600">
            {customer.channel}
          </span>
        )}
        {customer.bill_to_state && (
          <span className="text-[11px] text-slate-400">
            {customer.bill_to_state}
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Revenue
          </div>
          <div className="text-xs font-semibold text-slate-800 tabular-nums">
            {formatMoney(ttmRevenue)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Last Order
          </div>
          <div className="text-xs font-medium text-slate-600 tabular-nums">
            {formatDate(customer.last_order_date)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Orders
          </div>
          <div className="text-xs font-semibold text-slate-800 tabular-nums">
            {customer.total_orders ?? "--"}
          </div>
        </div>
      </div>
    </div>
  );
}
