"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import clsx from "clsx";

import PageMeta from "@/components/PageMeta";
import DetailsTab from "./modal/tabs/DetailsTab";
import OrdersTab from "./modal/tabs/OrdersTab";
import SalesAnalysisTab from "./modal/tabs/SalesAnalysisTab";
import EmailsTab from "./modal/tabs/EmailsTab";

import useCustomerSummary from "./modal/hooks/useCustomerSummary";
import useCustomerOrders, {
  ORDER_PAGE_SIZE,
  type OrderSortKey,
} from "./modal/hooks/useCustomerOrders";
import useCustomerMonthlyOrders from "./modal/hooks/useCustomerMonthlyOrders";
import useCustomerSalesAnalysis from "./modal/hooks/useCustomerSalesAnalysis";
import useCustomerContact from "./modal/hooks/useCustomerContact";
import useCustomerCustomFields from "./modal/hooks/useCustomerCustomFields";
import type { Customer } from "./types";

type Tab = "details" | "orders" | "analysis" | "emails";

export default function CustomerDetailPage({
  customerId,
  isD2C = false,
}: {
  customerId: string;
  isD2C?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("details");

  /* ─── Data hooks ─── */

  const { summary, loading: summaryLoading } = useCustomerSummary(customerId, isD2C);
  const { contact, loading: contactLoading } = useCustomerContact(customerId, isD2C);

  // Always load monthly data — needed for TTM trend in header + details tab chart
  const { monthlyData, loading: monthlyLoading } = useCustomerMonthlyOrders(
    customerId,
    true,
    isD2C
  );

  /* Orders table sort — server-side, since the list is paginated: sorting the
     25 rows in hand would silently reorder a slice, not the history. */
  const [orderSort, setOrderSort] = useState<{
    key: OrderSortKey;
    dir: "asc" | "desc";
  }>({ key: "completed", dir: "desc" });

  const {
    orders,
    loading: ordersLoading,
    orderPage,
    setOrderPage,
    totalCount: ordersTotalCount,
    totalPages: ordersTotalPages,
  } = useCustomerOrders(customerId, tab === "orders", isD2C, orderSort);

  const { data: analysisData, loading: analysisLoading } =
    useCustomerSalesAnalysis(customerId, tab === "analysis", isD2C);

  const { fields: customFields, loading: customFieldsLoading } =
    useCustomerCustomFields(customerId, isD2C);

  /* Date and number columns open descending; text columns ascending. */
  const ORDER_DESC_FIRST: OrderSortKey[] = ["order", "placed", "completed", "total"];

  function toggleOrderSort(key: OrderSortKey) {
    setOrderSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: ORDER_DESC_FIRST.includes(key) ? "desc" : "asc" }
    );
    setOrderPage(1);
  }

  function changeOrderPage(page: number) {
    setOrderPage(page);
  }

  /* ─── Derived ─── */

  const customerName = summary?.name ?? contact?.customer_name ?? customerId;
  const status = getStatus(summary?.last_order_date ?? contact?.last_order_date ?? null);

  // TTM vs Prior TTM trend
  // TTM    = last 12 full months (e.g. Apr 2025 – Mar 2026)
  // Prior  = the 12 months before that (e.g. Apr 2024 – Mar 2025)
  const ttmTrend = useMemo(() => {
    if (!monthlyData.length) return null;

    const now = new Date();
    // Current month (partial) is included in TTM
    const ttmEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);   // Apr 1, 2026 (exclusive)
    const ttmStart = new Date(now.getFullYear(), now.getMonth() - 11, 1); // Apr 1, 2025
    const priorStart = new Date(now.getFullYear(), now.getMonth() - 23, 1); // Apr 1, 2024

    let ttmRevenue = 0;
    let priorRevenue = 0;

    monthlyData.forEach((row) => {
      const [y, m] = row.month_key.split("-").map(Number);
      const rowDate = new Date(y, m - 1, 1);

      if (rowDate >= ttmStart && rowDate < ttmEnd) {
        ttmRevenue += Number(row.revenue);
      } else if (rowDate >= priorStart && rowDate < ttmStart) {
        priorRevenue += Number(row.revenue);
      }
    });

    if (priorRevenue === 0 && ttmRevenue === 0) return null;
    if (priorRevenue === 0) return { pct: 100, direction: "up" as const, ttm: ttmRevenue, prior: priorRevenue };

    const pct = Math.round(((ttmRevenue - priorRevenue) / priorRevenue) * 100);
    if (pct > 0) return { pct, direction: "up" as const, ttm: ttmRevenue, prior: priorRevenue };
    if (pct < 0) return { pct: Math.abs(pct), direction: "down" as const, ttm: ttmRevenue, prior: priorRevenue };
    return { pct: 0, direction: "flat" as const, ttm: ttmRevenue, prior: priorRevenue };
  }, [monthlyData]);

  // Order count for tab badge
  const orderCount = summary?.lifetime_orders ?? contact?.order_count ?? null;

  /* ─── Tab config with badges ─── */

  const tabConfig: { value: Tab; label: string; badge?: string | number | null }[] = [
    { value: "details", label: "Details" },
    { value: "orders", label: "Orders", badge: orderCount },
    { value: "analysis", label: "Sales Analysis" },
    { value: "emails", label: "Emails" },
  ];

  /* ─── Render ─── */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      <PageMeta
        title={customerName}
        description={`${isD2C ? "D2C" : "Wholesale"} customer details, orders, sales, and emails.`}
      />

      {/* Header — one card for the customer: identity on the left, metric
          tiles on the right, and the section tabs along its bottom edge. */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 px-5 pt-4 pb-4 sm:px-6 sm:pt-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Identity */}
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="mb-1.5">
              <ol className="flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
                <li>
                  <Link
                    href={isD2C ? "/customers/d2c" : "/customers"}
                    className="inline-flex items-center gap-1 transition hover:text-gray-900"
                  >
                    <ArrowLeft size={12} />
                    {isD2C ? "D2C customers" : "Wholesale customers"}
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="truncate text-gray-500">
                  {customerName}
                </li>
              </ol>
            </nav>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-900">
              {customerName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-gray-400">#{customerId}</span>
              {status && (
                <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", status.bg, status.color)}>
                  {status.label}
                </span>
              )}
              {contact?.primary_channel && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {contact.primary_channel}
                </span>
              )}
            </div>
          </div>

          {/* Metric tiles */}
          {(summary || contact) && (
            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-stretch sm:gap-3">
              {(summary?.lifetime_revenue ?? contact?.lifetime_revenue) != null && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-2.5 sm:min-w-[132px]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Lifetime revenue</div>
                  <div className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">
                    ${(summary?.lifetime_revenue ?? contact?.lifetime_revenue ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                </div>
              )}

              {ttmTrend && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-2.5 sm:min-w-[108px]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">TTM trend</div>
                  <div className={clsx("mt-0.5 flex items-center gap-1 text-xl font-semibold tabular-nums", {
                    "text-green-600": ttmTrend.direction === "up",
                    "text-red-600": ttmTrend.direction === "down",
                    "text-gray-500": ttmTrend.direction === "flat",
                  })}>
                    {ttmTrend.direction === "up" && <TrendingUp size={16} />}
                    {ttmTrend.direction === "down" && <TrendingDown size={16} />}
                    {ttmTrend.direction === "flat" && <Minus size={16} />}
                    {ttmTrend.direction === "flat" ? "Flat" : `${ttmTrend.pct}%`}
                  </div>
                </div>
              )}

              {orderCount != null && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-2.5 sm:min-w-[96px]">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Orders</div>
                  <div className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">
                    {orderCount.toLocaleString("en-US")}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section tabs */}
        <nav
          role="tablist"
          aria-label="Customer sections"
          className="flex gap-7 overflow-x-auto border-t border-gray-100 px-5 sm:px-6"
        >
          {tabConfig.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.value)}
                className={clsx(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 py-3.5 text-sm font-medium transition",
                  active
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
                )}
              >
                {t.label}
                {t.badge != null && (
                  <span
                    className={clsx(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                      active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── Churned Re-engagement Banner ─── */}
      {status?.label === "Churned" && (contact?.email || contact?.phone) && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-amber-800">
              This customer hasn&apos;t ordered in over a year
            </div>
            <div className="text-xs text-amber-600 mt-0.5">
              Re-engage to win them back.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {contact?.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 transition"
              >
                <Mail size={13} />
                Send Email
              </a>
            )}
            {contact?.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 transition"
              >
                <Phone size={13} />
                Call
              </a>
            )}
          </div>
        </div>
      )}

      {/* ─── At Risk Warning Banner ─── */}
      {status?.label === "At Risk" && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-blue-800">
              This customer hasn&apos;t ordered in 6+ months
            </div>
            <div className="text-xs text-blue-600 mt-0.5">
              Consider reaching out before they churn.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {contact?.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 transition"
              >
                <Mail size={13} />
                Send Email
              </a>
            )}
            {contact?.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 transition"
              >
                <Phone size={13} />
                Call
              </a>
            )}
          </div>
        </div>
      )}

      {/* ─── Main content ─── */}
      <div className="min-w-0 space-y-5">

          {/* Tab content */}
          <div>
            {tab === "details" && (
              <DetailsTab
                loading={summaryLoading || monthlyLoading}
                summary={summary}
                contact={contact}
                contactLoading={contactLoading}
                monthlyData={monthlyData}
                customFields={customFields}
              />
            )}

            {tab === "orders" && (
              <OrdersTab
                orders={orders}
                ordersLoading={ordersLoading}
                sortKey={orderSort.key}
                sortDir={orderSort.dir}
                onSort={toggleOrderSort}
                page={orderPage}
                pageCount={ordersTotalPages}
                totalCount={ordersTotalCount}
                pageSize={ORDER_PAGE_SIZE}
                onPageChange={changeOrderPage}
              />
            )}

            {tab === "analysis" && (
              <SalesAnalysisTab
                data={analysisData}
                loading={analysisLoading}
              />
            )}

            {tab === "emails" && (
              <EmailsTab customerId={customerId} isD2C={isD2C} />
            )}
          </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function getStatus(lastOrderDate: string | null) {
  if (!lastOrderDate) return null;
  const daysSince = Math.floor(
    (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince <= 180) return { label: "Active", color: "text-green-700", bg: "bg-green-50" };
  if (daysSince <= 365) return { label: "At Risk", color: "text-amber-700", bg: "bg-amber-50" };
  return { label: "Churned", color: "text-gray-500", bg: "bg-gray-100" };
}
