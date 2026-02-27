"use client";

import { useEffect } from "react";
import { formatMoney } from "../utils/format";
import type { CustomerContact } from "../hooks/useCustomerContact";

export default function ContactTab({
  summary,
}: {
  summary: CustomerContact | null;
}) {

  useEffect(() => {
    console.log("📇 ContactTab summary received:", summary);
  }, [summary]);

  if (!summary) {
    return (
      <div className="text-sm text-slate-400">
        No contact information available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-8 text-sm">

      {/* BILLING */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm space-y-2">
        <div className="font-semibold mb-3 text-slate-700">Billing</div>
        <div>{summary.customer_name ?? "—"}</div>
        <div>
          {summary.billto_city ?? "—"}
          {summary.billto_state ? `, ${summary.billto_state}` : ""}
        </div>
      </div>

      {/* CONTACT */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm space-y-2">
        <div className="font-semibold mb-3 text-slate-700">Contact</div>
        <div>{summary.email ?? "—"}</div>
        <div>{summary.phone ?? "—"}</div>
        <div className="text-slate-400 text-xs pt-2">
          Primary Channel: {summary.primary_channel ?? "—"}
        </div>
      </div>

      {/* SHIPPING */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm space-y-2">
        <div className="font-semibold mb-3 text-slate-700">Shipping</div>
        <div>
          {summary.shipto_city ?? "—"}
          {summary.shipto_state ? `, ${summary.shipto_state}` : ""}
        </div>
      </div>

      {/* STATS */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm space-y-2">
        <div className="font-semibold mb-3 text-slate-700">Customer Stats</div>
        <div>First Order: {summary.first_order_date ?? "—"}</div>
        <div>Last Order: {summary.last_order_date ?? "—"}</div>
        <div>Total Orders: {summary.order_count ?? 0}</div>
        <div>
          Lifetime Revenue:{" "}
          {summary.lifetime_revenue != null
            ? formatMoney(summary.lifetime_revenue)
            : "—"}
        </div>
      </div>

    </div>
  );
}