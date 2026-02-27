// /modal/tabs/DetailsTab.tsx
"use client";

import SoftCard from "../components/SoftCard";
import { formatDate, formatMoney } from "../utils/format";

export default function DetailsTab({
  loading,
  summary,
  totalOrders,
  totalSpend,
  aov,
}: {
  loading: boolean;
  summary: any;
  totalOrders: number;
  totalSpend: number;
  aov: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
      {loading ? (
        <div className="text-sm text-slate-400">Loading summary...</div>
      ) : (
        <>
          <SoftCard label="Channel" value={summary?.channel ?? "—"} />
          <SoftCard
            label="Customer Since"
            value={formatDate(summary?.first_order_date)}
          />
          <SoftCard label="Total Orders" value={String(totalOrders)} />
          <SoftCard label="Total Spend" value={formatMoney(totalSpend)} />
          <SoftCard label="AOV" value={formatMoney(aov)} />
        </>
      )}
    </div>
  );
}