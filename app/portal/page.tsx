"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Users, DollarSign } from "lucide-react";
import { portalGet, usd, shortDate, type PortalSummary } from "@/components/portal/api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PortalDashboard() {
  const [data, setData] = useState<PortalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalGet<PortalSummary>("/api/portal/summary")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  const { kpis, monthly, topCustomers } = data;
  const up = kpis.variance >= 0;
  const peak = Math.max(1, ...monthly.map((m) => Math.max(m.sales_2025, m.sales_2026)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Your performance</h1>
        <p className="mt-1 text-sm text-gray-500">2026 year-to-date vs. 2025, for your agency.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi icon={<Users className="h-4 w-4" />} label="Customers" value={kpis.customers.toLocaleString()} />
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="2026 sales" value={usd(kpis.sales_2026)} />
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            {up ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-rose-600" />}
            Year over year
          </div>
          <div className={`mt-2 text-2xl font-semibold ${up ? "text-emerald-700" : "text-rose-700"}`}>
            {up ? "+" : "−"}
            {usd(Math.abs(kpis.variance))}
          </div>
          <div className="text-xs text-gray-500">
            {kpis.variance_pct >= 0 ? "+" : ""}
            {kpis.variance_pct.toFixed(1)}% vs. {usd(kpis.sales_2025)} in 2025
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Monthly sales</h2>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-gray-300" />2025</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-gray-900" />2026</span>
          </div>
        </div>
        <div className="flex items-end gap-1.5 sm:gap-3" style={{ height: 180 }}>
          {monthly.map((m, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-[150px] w-full items-end justify-center gap-0.5">
                <div
                  className="w-1/2 rounded-t bg-gray-300"
                  style={{ height: `${(m.sales_2025 / peak) * 100}%` }}
                  title={`2025: ${usd(m.sales_2025)}`}
                />
                <div
                  className="w-1/2 rounded-t bg-gray-900"
                  style={{ height: `${(m.sales_2026 / peak) * 100}%` }}
                  title={`2026: ${usd(m.sales_2026)}`}
                />
              </div>
              <span className="text-[10px] text-gray-400">{MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top customers */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Top customers</h2>
          <Link href="/portal/customers" className="text-xs font-medium text-gray-500 hover:text-gray-900">
            View all →
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {topCustomers.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">No customers found for your agency yet.</p>
          )}
          {topCustomers.map((c) => (
            <div key={c.customerid} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-400">
                  {c.state ?? "—"} · last order {shortDate(c.last_order_date)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">{usd(c.sales_2026)}</div>
                <div className="text-xs text-gray-400">2025: {usd(c.sales_2025)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
