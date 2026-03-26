"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Hash,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Plus,
} from "lucide-react";
import clsx from "clsx";

import { supabase } from "@/lib/supabaseClient";
import DetailsTab from "./modal/tabs/DetailsTab";
import OrdersTab from "./modal/tabs/OrdersTab";
import SalesAnalysisTab from "./modal/tabs/SalesAnalysisTab";
import ActivitySection, { type ActivitySectionHandle } from "./modal/tabs/ActivitySection";

import useCustomerSummary from "./modal/hooks/useCustomerSummary";
import useCustomerOrders from "./modal/hooks/useCustomerOrders";
import useOrderItems from "./modal/hooks/useOrderItems";
import useCustomerMonthlyOrders from "./modal/hooks/useCustomerMonthlyOrders";
import useCustomerSalesAnalysis from "./modal/hooks/useCustomerSalesAnalysis";
import useCustomerContact from "./modal/hooks/useCustomerContact";
import useCustomerActivities from "./modal/hooks/useCustomerActivities";
import useCustomerCustomFields from "./modal/hooks/useCustomerCustomFields";
import type { Customer } from "./types";

type Tab = "details" | "orders" | "analysis" | "touchpoints";

type RelatedCustomer = {
  customerid: string;
  name: string;
  channel: string;
  lifetime_revenue: number | null;
  last_order_date: string | null;
};

type NavNeighbor = { customerid: string; name: string } | null;

export default function CustomerDetailPage({
  customerId,
  isD2C = false,
}: {
  customerId: string;
  isD2C?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("details");
  const activityRef = useRef<ActivitySectionHandle>(null);

  /* ─── Data hooks ─── */

  const { summary, loading: summaryLoading } = useCustomerSummary(customerId, isD2C);
  const { contact, loading: contactLoading } = useCustomerContact(customerId, isD2C);

  // Always load monthly data — needed for TTM trend in header + details tab chart
  const { monthlyData, loading: monthlyLoading } = useCustomerMonthlyOrders(
    customerId,
    true,
    isD2C
  );

  const {
    orders,
    setOrders,
    loading: ordersLoading,
  } = useCustomerOrders(customerId, tab === "orders", isD2C);

  const items = useOrderItems({ orders, setOrders });

  const { data: analysisData, loading: analysisLoading } =
    useCustomerSalesAnalysis(customerId, tab === "analysis", isD2C);

  const {
    activities,
    loading: activitiesLoading,
    addActivity,
    updateActivity,
    toggleComplete,
    deleteActivity,
  } = useCustomerActivities(customerId);

  const { fields: customFields, loading: customFieldsLoading } =
    useCustomerCustomFields(customerId, isD2C);

  useEffect(() => {
    if (tab !== "orders") items.reset();
  }, [tab]);

  /* ─── Prev / Next customer navigation ─── */

  const [prevCustomer, setPrevCustomer] = useState<NavNeighbor>(null);
  const [nextCustomer, setNextCustomer] = useState<NavNeighbor>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadNeighbors() {
      const table = isD2C ? "d2c_customer_summary" : "customer_summary";
      const idField = isD2C ? "person_key" : "customerid";

      const [prevRes, nextRes] = await Promise.all([
        Promise.resolve(
          supabase
            .from(table)
            .select(`${idField}, name`)
            .lt("name", summary?.name ?? "")
            .order("name", { ascending: false })
            .limit(1)
        ),
        Promise.resolve(
          supabase
            .from(table)
            .select(`${idField}, name`)
            .gt("name", summary?.name ?? "")
            .order("name", { ascending: true })
            .limit(1)
        ),
      ]);

      if (cancelled) return;

      const prevRow = prevRes.data?.[0] as Record<string, string> | undefined;
      const nextRow = nextRes.data?.[0] as Record<string, string> | undefined;

      setPrevCustomer(
        prevRow ? { customerid: prevRow[idField], name: prevRow.name } : null
      );
      setNextCustomer(
        nextRow ? { customerid: nextRow[idField], name: nextRow.name } : null
      );
    }

    if (summary?.name) loadNeighbors();

    return () => {
      cancelled = true;
    };
  }, [summary?.name]);

  /* ─── Related customers (same state + same channel) ─── */

  const [relatedByState, setRelatedByState] = useState<RelatedCustomer[]>([]);
  const [relatedByChannel, setRelatedByChannel] = useState<RelatedCustomer[]>([]);
  const [relatedLoaded, setRelatedLoaded] = useState(false);

  const loadRelated = useCallback(async () => {
    if (!contact) return;

    const state = contact.billto_state;
    const channel = contact.primary_channel;

    const queries: Promise<void>[] = [];

    if (state) {
      queries.push(
        Promise.resolve(
          supabase
            .from("customer_summary")
            .select("customerid, name, channel, lifetime_revenue, last_order_date")
            .eq("bill_to_state", state)
            .neq("customerid", customerId)
            .order("lifetime_revenue", { ascending: false })
            .limit(5)
        ).then(({ data }) => {
          setRelatedByState((data as RelatedCustomer[]) ?? []);
        })
      );
    }

    if (channel) {
      queries.push(
        Promise.resolve(
          supabase
            .from("customer_summary")
            .select("customerid, name, channel, lifetime_revenue, last_order_date")
            .eq("channel", channel)
            .neq("customerid", customerId)
            .order("lifetime_revenue", { ascending: false })
            .limit(5)
        ).then(({ data }) => {
          setRelatedByChannel((data as RelatedCustomer[]) ?? []);
        })
      );
    }

    await Promise.all(queries);
    setRelatedLoaded(true);
  }, [contact, customerId]);

  useEffect(() => {
    loadRelated();
  }, [loadRelated]);

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

  // Check if right panel has content
  const hasRelatedContent =
    (relatedByState.length > 0 && contact?.billto_state) ||
    (relatedByChannel.length > 0 && contact?.primary_channel);

  /* ─── Tab config with badges ─── */

  const activityCount = activities.length || null;

  const tabConfig: { value: Tab; label: string; badge?: string | number | null }[] = [
    { value: "details", label: "Details" },
    { value: "orders", label: "Orders", badge: orderCount },
    { value: "analysis", label: "Sales Analysis" },
    { value: "touchpoints", label: "Touchpoints", badge: activityCount },
  ];

  /* ─── Render ─── */

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-5">
      {/* Back link + prev/next nav */}
      <div className="flex items-center justify-between">
        <Link
          href={isD2C ? "/customers/d2c" : "/customers"}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition"
        >
          <ArrowLeft size={16} /> Back to {isD2C ? "D2C" : "wholesale"} customers
        </Link>

        <div className="flex items-center gap-1">
          {prevCustomer ? (
            <Link
              href={`${isD2C ? "/customers/d2c" : "/customers"}/${encodeURIComponent(prevCustomer.customerid)}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
              title={prevCustomer.name}
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline max-w-[120px] truncate">{prevCustomer.name}</span>
            </Link>
          ) : (
            <span className="px-2.5 py-1.5 rounded-lg border border-gray-100 text-xs text-gray-300">
              <ChevronLeft size={14} />
            </span>
          )}
          {nextCustomer ? (
            <Link
              href={`${isD2C ? "/customers/d2c" : "/customers"}/${encodeURIComponent(nextCustomer.customerid)}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
              title={nextCustomer.name}
            >
              <span className="hidden sm:inline max-w-[120px] truncate">{nextCustomer.name}</span>
              <ChevronRight size={14} />
            </Link>
          ) : (
            <span className="px-2.5 py-1.5 rounded-lg border border-gray-100 text-xs text-gray-300">
              <ChevronRight size={14} />
            </span>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{customerName}</h1>
            {status && (
              <span className={clsx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", status.bg, status.color)}>
                {status.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5">
            <p className="text-sm text-gray-500 font-mono">{customerId}</p>

            <button
              onClick={() => {
                setTab("touchpoints");
                // Small delay so ActivitySection mounts before we call openForm
                setTimeout(() => activityRef.current?.openForm("task"), 50);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:shadow-sm transition"
            >
              <Plus size={13} />
              Action
            </button>
          </div>
        </div>

        {(summary || contact) && (
          <div className="flex items-center gap-4 shrink-0">
            {contact?.primary_channel && (
              <div className="text-right">
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Channel</div>
                <div className="text-sm font-medium text-gray-700">{contact.primary_channel}</div>
              </div>
            )}

            {ttmTrend && (
              <div className="text-right">
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">TTM Trend</div>
                <div className={clsx("flex items-center justify-end gap-1 text-sm font-semibold", {
                  "text-green-600": ttmTrend.direction === "up",
                  "text-red-600": ttmTrend.direction === "down",
                  "text-gray-500": ttmTrend.direction === "flat",
                })}>
                  {ttmTrend.direction === "up" && <TrendingUp size={14} />}
                  {ttmTrend.direction === "down" && <TrendingDown size={14} />}
                  {ttmTrend.direction === "flat" && <Minus size={14} />}
                  {ttmTrend.direction === "flat" ? "Flat" : `${ttmTrend.pct}%`}
                </div>
              </div>
            )}

            {(summary?.lifetime_revenue ?? contact?.lifetime_revenue) != null && (
              <div className="text-right">
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Lifetime Revenue</div>
                <div className="text-lg font-semibold tabular-nums text-gray-900">
                  ${(summary?.lifetime_revenue ?? contact?.lifetime_revenue ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Churned Re-engagement Banner ─── */}
      {status?.label === "Churned" && (contact?.email || contact?.phone) && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-amber-800">
              This customer hasn&apos;t ordered in over a year
            </div>
            <div className="text-xs text-amber-600 mt-0.5">
              Re-engage with a personal touchpoint to win them back.
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

      {/* ─── Two-Panel Layout ─── */}
      <div className="flex gap-6 items-start">
        {/* LEFT PANEL (larger) */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Tab nav */}
          <nav className="flex gap-1 rounded-lg bg-white border border-gray-200 p-1">
            {tabConfig.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={clsx(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition inline-flex items-center justify-center gap-2",
                  tab === t.value
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                {t.label}
                {t.badge != null && (
                  <span className={clsx(
                    "text-[10px] font-medium rounded-full px-1.5 py-0.5 tabular-nums",
                    tab === t.value
                      ? "bg-gray-200 text-gray-700"
                      : "bg-gray-100 text-gray-400"
                  )}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

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
                expandedOrder={items.expandedOrder}
                toggleOrder={items.toggleOrder}
                getItemMeta={items.getItemMeta}
              />
            )}

            {tab === "analysis" && (
              <SalesAnalysisTab
                data={analysisData}
                loading={analysisLoading}
              />
            )}

            {tab === "touchpoints" && (
              <ActivitySection
                ref={activityRef}
                activities={activities}
                loading={activitiesLoading}
                onAdd={addActivity}
                onUpdate={updateActivity}
                onToggleComplete={toggleComplete}
                onDelete={deleteActivity}
              />
            )}
          </div>
        </div>

        {/* RIGHT PANEL — desktop */}
        <div className="hidden lg:block w-80 shrink-0 space-y-4">
          {relatedByState.length > 0 && contact?.billto_state && (
            <RelatedCard
              title={`Customers in ${contact.billto_state}`}
              customers={relatedByState}
              icon={<MapPin size={14} className="text-gray-400" />}
            />
          )}

          {relatedByChannel.length > 0 && contact?.primary_channel && (
            <RelatedCard
              title={`${contact.primary_channel} Customers`}
              customers={relatedByChannel}
              icon={<Hash size={14} className="text-gray-400" />}
            />
          )}

          {/* Empty state when no related customers */}
          {relatedLoaded && !hasRelatedContent && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
              <Users size={20} className="mx-auto text-gray-300 mb-2" />
              <div className="text-xs text-gray-400">No related customers found</div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Mobile Related Customers (below main content) ─── */}
      <div className="lg:hidden space-y-4">
        {relatedByState.length > 0 && contact?.billto_state && (
          <RelatedCard
            title={`Customers in ${contact.billto_state}`}
            customers={relatedByState}
            icon={<MapPin size={14} className="text-gray-400" />}
          />
        )}

        {relatedByChannel.length > 0 && contact?.primary_channel && (
          <RelatedCard
            title={`${contact.primary_channel} Customers`}
            customers={relatedByChannel}
            icon={<Hash size={14} className="text-gray-400" />}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Related Customers Card ─── */

function RelatedCard({
  title,
  customers,
  icon,
}: {
  title: string;
  customers: RelatedCustomer[];
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-medium text-gray-700">{title}</h3>
      </div>

      <div className="divide-y divide-gray-100">
        {customers.map((c) => (
          <Link
            key={c.customerid}
            href={`/customers/${encodeURIComponent(c.customerid)}`}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{c.name}</div>
              <div className="text-[10px] text-gray-400">{c.channel}</div>
            </div>
            {c.lifetime_revenue != null && (
              <span className="text-xs font-medium text-gray-500 tabular-nums shrink-0 ml-3">
                ${c.lifetime_revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            )}
          </Link>
        ))}
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
