"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Users, DollarSign, TrendingUp } from "@/components/portal/icons";
import { portalGet, portalHref, usd, shortDate, type PortalSummary } from "@/components/portal/api";
import { properCase } from "@/lib/textCase";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const ytdUp = kpis.ytd_variance >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Your performance</h1>
        <p className="mt-1 text-sm text-gray-500">2026 year-to-date vs. 2025, for your agency.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Customers — count with its health split in the same card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Users className="h-4 w-4" />
            Customers
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {kpis.customers.toLocaleString()}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <HealthChip label="Active" value={kpis.active} tone="active" />
            <HealthChip label="At risk" value={kpis.at_risk} tone="at_risk" />
            <HealthChip label="Churned" value={kpis.churned} tone="churned" />
            {kpis.no_orders > 0 && (
              <HealthChip label="No orders" value={kpis.no_orders} tone="none" />
            )}
          </div>
        </div>

        {/* 2026 sales YTD — compared to the SAME window last year */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <DollarSign className="h-4 w-4" />
            2026 sales · YTD
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {usd(kpis.sales_2026)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            {ytdUp ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />
            )}
            <span className={ytdUp ? "text-emerald-700" : "text-rose-700"}>
              {ytdUp ? "+" : "−"}
              {usd(Math.abs(kpis.ytd_variance))} ({kpis.ytd_variance_pct >= 0 ? "+" : ""}
              {kpis.ytd_variance_pct.toFixed(1)}%)
            </span>
            <span className="text-gray-500">
              vs. {usd(kpis.sales_2025_ytd)} through {kpis.ytd_through} 2025
            </span>
          </div>
        </div>

        {/* Year over year — full-year 2025 vs 2026 YTD, and where 2026 is pacing */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <TrendingUp className="h-4 w-4" />
            Year over year
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900">
              {kpis.pct_of_2025 === null ? "—" : `${kpis.pct_of_2025.toFixed(0)}%`}
            </span>
            <span className="text-xs text-gray-500">of 2025 so far</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {usd(kpis.sales_2026)} YTD vs. {usd(kpis.sales_2025)} full-year 2025
          </div>
          {/* Progress toward last year's total */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-700"
              style={{ width: `${Math.min(kpis.pct_of_2025 ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <MonthlyChart monthly={monthly} />

      {/* Top customers */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Top customers</h2>
          <Link href={portalHref("/portal/customers")} className="text-xs font-medium text-gray-500 hover:text-gray-900">
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
                <div className="truncate text-sm font-medium text-gray-900">{properCase(c.name)}</div>
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

/**
 * Month-by-month 2025 vs 2026, with a proper hover card in place of the browser's
 * native `title` tooltip. Hovering (or focusing) a month surfaces both years'
 * totals and the year-over-year delta — the number a rep actually wants when they
 * glance at a bar. Bars share a single scale so heights compare honestly.
 */
function MonthlyChart({ monthly }: { monthly: PortalSummary["monthly"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...monthly.map((m) => Math.max(m.sales_2025, m.sales_2026)));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Monthly sales</h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-gray-300" />2025</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-gray-900" />2026</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 sm:gap-3" style={{ height: 188 }}>
        {monthly.map((m, i) => {
          const delta = m.sales_2026 - m.sales_2025;
          const pct = m.sales_2025 > 0 ? (delta / m.sales_2025) * 100 : null;
          const active = hover === i;
          // Keep the card on-screen at the edges instead of centering it off the card.
          const align = i <= 1 ? "left-0" : i >= 10 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <div
              key={i}
              className="group relative flex flex-1 flex-col items-center gap-1"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              tabIndex={0}
              aria-label={`${MONTHS_FULL[i]}: 2026 ${usd(m.sales_2026)}, 2025 ${usd(m.sales_2025)}`}
            >
              {active && (
                <div
                  role="tooltip"
                  className={`absolute bottom-[calc(100%-6px)] z-10 w-44 ${align} rounded-xl border border-gray-200 bg-white p-3 text-left shadow-lg`}
                >
                  <div className="mb-2 text-xs font-semibold text-gray-900">{MONTHS_FULL[i]}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500"><i className="h-2 w-2 rounded-sm bg-gray-900" />2026</span>
                    <span className="font-medium tabular-nums text-gray-900">{usd(m.sales_2026)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500"><i className="h-2 w-2 rounded-sm bg-gray-300" />2025</span>
                    <span className="font-medium tabular-nums text-gray-600">{usd(m.sales_2025)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                    <span className="text-gray-500">YoY</span>
                    <span className={`font-semibold tabular-nums ${delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {delta >= 0 ? "+" : "−"}{usd(Math.abs(delta))}
                      {pct !== null && (
                        <span className="ml-1 font-normal text-gray-400">
                          ({pct >= 0 ? "+" : ""}{pct.toFixed(0)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
              <div className={`flex h-[150px] w-full items-end justify-center gap-0.5 rounded-md transition-colors ${active ? "bg-gray-50" : ""}`}>
                <div
                  className="w-1/2 rounded-t bg-gray-300 transition-opacity"
                  style={{ height: `${Math.max((m.sales_2025 / peak) * 100, m.sales_2025 > 0 ? 2 : 0)}%`, opacity: active ? 0.85 : 1 }}
                />
                <div
                  className="w-1/2 rounded-t bg-gray-900 transition-opacity"
                  style={{ height: `${Math.max((m.sales_2026 / peak) * 100, m.sales_2026 > 0 ? 2 : 0)}%`, opacity: active ? 0.85 : 1 }}
                />
              </div>
              <span className={`text-[10px] transition-colors ${active ? "font-medium text-gray-700" : "text-gray-400"}`}>
                {MONTHS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HEALTH_TONE: Record<"active" | "at_risk" | "churned" | "none", string> = {
  active: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  churned: "bg-rose-50 text-rose-700",
  none: "bg-gray-100 text-gray-500",
};

function HealthChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "active" | "at_risk" | "churned" | "none";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${HEALTH_TONE[tone]}`}
    >
      <span className="tabular-nums">{value.toLocaleString()}</span>
      {label}
    </span>
  );
}
