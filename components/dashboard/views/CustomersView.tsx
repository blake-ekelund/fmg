"use client";

import {
  Users,
  AlertTriangle,
  UserX,
  UserCheck,
  DollarSign,
  ShoppingBag,
  Building2,
} from "lucide-react";
import Link from "next/link";
import type { CustomerSummaryRow, CustomerKPIs } from "../hooks/useDashboardCustomers";

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/* ── Compact stat pill ── */
function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
      <span className="text-sm font-bold tabular-nums text-gray-900">{value}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}

/* ── Single channel panel ── */
function ChannelPanel({
  title,
  icon,
  accent,
  kpis,
  customers,
  href,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  kpis: CustomerKPIs;
  customers: CustomerSummaryRow[];
  href: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-24 bg-gray-100 rounded animate-pulse" />
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  const top3 = [...customers]
    .filter((c) => (c.sales_2026 ?? 0) > 0)
    .sort((a, b) => (b.sales_2026 ?? 0) - (a.sales_2026 ?? 0))
    .slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Channel header */}
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-md ${accent}`}>{icon}</div>
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <span className="text-[11px] text-gray-400 ml-auto">{kpis.total} total</span>
      </div>

      {/* Stat row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Stat label="Active" value={kpis.active} color="bg-emerald-500" />
        <Stat label="At Risk" value={kpis.at_risk} color="bg-amber-400" />
        <Stat label="Churned" value={kpis.churned} color="bg-red-400" />
        <Stat label="2026" value={fmt(kpis.total_revenue_2026)} color="bg-blue-500" />
      </div>

      {/* Top customers */}
      {top3.length > 0 && (
        <div className="space-y-0.5">
          {top3.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
            >
              <span className="text-[10px] font-bold text-gray-300 w-3 shrink-0">
                {i + 1}
              </span>
              <span className="text-xs text-gray-600 truncate flex-1">{c.name}</span>
              <span className="text-xs font-semibold tabular-nums text-gray-800 shrink-0">
                {fmt(c.sales_2026 ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href={href}
        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
      >
        View all &rarr;
      </Link>
    </div>
  );
}

/* ── Combined view ── */
export default function CustomersView({
  wsCustomers,
  wsKpis,
  wsLoading,
  d2cCustomers,
  d2cKpis,
  d2cLoading,
}: {
  wsCustomers: CustomerSummaryRow[];
  wsKpis: CustomerKPIs;
  wsLoading: boolean;
  d2cCustomers: CustomerSummaryRow[];
  d2cKpis: CustomerKPIs;
  d2cLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-0">
      {/* Wholesale */}
      <div className="p-3 md:pr-5 md:border-r border-gray-100">
        <ChannelPanel
          title="Wholesale"
          icon={<Building2 size={14} className="text-indigo-600" />}
          accent="bg-indigo-100"
          kpis={wsKpis}
          customers={wsCustomers}
          href="/customers"
          loading={wsLoading}
        />
      </div>

      {/* Divider on mobile */}
      <div className="h-px bg-gray-100 md:hidden" />

      {/* D2C */}
      <div className="p-3 md:pl-5">
        <ChannelPanel
          title="D2C"
          icon={<ShoppingBag size={14} className="text-pink-600" />}
          accent="bg-pink-100"
          kpis={d2cKpis}
          customers={d2cCustomers}
          href="/customers/d2c"
          loading={d2cLoading}
        />
      </div>
    </div>
  );
}
