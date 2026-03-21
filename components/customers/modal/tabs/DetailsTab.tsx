"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Mail, Phone, MapPin } from "lucide-react";
import clsx from "clsx";

import { formatDate, formatMoney } from "../utils/format";
import { CHART_NAVY } from "@/lib/colors";
import type { CustomerContact } from "../hooks/useCustomerContact";

export type CustomerSummary = {
  customerid: string;
  name: string | null;
  bill_to_state: string | null;
  channel: string | null;
  first_order_date: string | null;
  last_order_date: string | null;
  last_order_amount: number | null;
  lifetime_orders: number | null;
  lifetime_revenue: number | null;
  lifetime_aov: number | null;
  sales_2023: number | null;
  sales_2024: number | null;
  sales_2025: number | null;
  sales_2026: number | null;
};

type MonthlyRow = {
  month_key: string;
  month_date: string;
  orders: number;
  revenue: number;
};

/* ─── Main Component ─── */

export default function DetailsTab({
  loading,
  summary,
  contact,
  contactLoading,
  monthlyData,
}: {
  loading: boolean;
  summary: CustomerSummary | null;
  contact: CustomerContact | null;
  contactLoading: boolean;
  monthlyData: MonthlyRow[];
}) {
  if (loading && contactLoading) {
    return (
      <div className="text-sm text-gray-400 py-8">Loading details...</div>
    );
  }

  /* ─── Derived ─── */

  const daysSinceLastOrder = summary?.last_order_date
    ? (() => {
        const [y, m, d] = summary.last_order_date!.split("-").map(Number);
        const last = new Date(y, m - 1, d);
        return Math.floor(
          (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24)
        );
      })()
    : null;

  const normalizedData = build24MonthSeries(monthlyData ?? []);
  const hasOrders = normalizedData.some((m) => m.orders > 0);

  return (
    <div className="space-y-5">
      {/* ═══════════ ROW 1: Contact + Account ═══════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact Info */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Contact Information
          </h3>

          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-900">
              {contact?.customer_name ?? summary?.name ?? "—"}
            </div>

            {contact?.email && (
              <div className="flex items-center gap-2">
                <Mail size={13} className="text-gray-400 shrink-0" />
                <a
                  href={`mailto:${contact.email}`}
                  className="text-sm text-blue-600 hover:underline truncate"
                >
                  {contact.email}
                </a>
              </div>
            )}

            {contact?.phone && (
              <div className="flex items-center gap-2">
                <Phone size={13} className="text-gray-400 shrink-0" />
                <a
                  href={`tel:${contact.phone}`}
                  className="text-sm text-gray-700 hover:underline"
                >
                  {contact.phone}
                </a>
              </div>
            )}

            {!contact?.email && !contact?.phone && (
              <div className="text-sm text-gray-400">
                No contact info on file
              </div>
            )}
          </div>
        </div>

        {/* Account Info */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Account
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <InfoField
              label="Channel"
              value={contact?.primary_channel ?? summary?.channel ?? "—"}
            />
            <InfoField
              label="Customer Since"
              value={formatDate(
                summary?.first_order_date ?? contact?.first_order_date ?? null
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Bill To */}
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                Bill To
              </div>
              <div className="flex items-start gap-1.5">
                <MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">
                  {contact?.billto_city || contact?.billto_state
                    ? `${contact.billto_city ?? ""}${
                        contact.billto_city && contact.billto_state ? ", " : ""
                      }${contact.billto_state ?? ""}`
                    : "—"}
                </span>
              </div>
            </div>

            {/* Ship To */}
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                Ship To
              </div>
              <div className="flex items-start gap-1.5">
                <MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">
                  {contact?.shipto_city || contact?.shipto_state
                    ? `${contact.shipto_city ?? ""}${
                        contact.shipto_city && contact.shipto_state ? ", " : ""
                      }${contact.shipto_state ?? ""}`
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ ROW 2: Sales Snapshot ═══════════ */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Sales Snapshot
        </h3>

        {summary ? (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <KPI
                label="Lifetime Revenue"
                value={formatMoney(summary.lifetime_revenue ?? 0)}
                large
              />
              <KPI label="Orders" value={String(summary.lifetime_orders ?? 0)} />
              <KPI
                label="Avg Order"
                value={formatMoney(summary.lifetime_aov ?? 0)}
              />
              <KPI
                label="Last Order"
                value={formatDate(summary.last_order_date)}
              />
              <KPI
                label="Days Since"
                value={
                  daysSinceLastOrder != null ? String(daysSinceLastOrder) : "—"
                }
              />
            </div>

            {/* 24-month chart */}
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                Order Activity (Last 24 Months)
              </div>
              {!hasOrders ? (
                <div className="h-48 flex items-center justify-center text-sm text-gray-400 bg-gray-50 rounded-lg">
                  No order activity in the last 24 months.
                </div>
              ) : (
                <div className="h-48 bg-gray-50 rounded-lg p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={normalizedData}>
                      <XAxis
                        dataKey="month"
                        tickFormatter={(value: string) => {
                          const [y, m] = value.split("-").map(Number);
                          return new Date(y, m - 1, 1).toLocaleDateString(
                            "en-US",
                            { month: "short", year: "2-digit" }
                          );
                        }}
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        domain={[0, "dataMax + 1"]}
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value: number | undefined) => [
                          value ?? 0,
                          "Orders",
                        ]}
                        labelFormatter={(label) => {
                          if (!label) return "";
                          const [y, m] = String(label).split("-").map(Number);
                          return new Date(y, m - 1, 1).toLocaleDateString(
                            "en-US",
                            { month: "long", year: "numeric" }
                          );
                        }}
                      />
                      <Bar
                        dataKey="orders"
                        fill={CHART_NAVY}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-400">
            No completed orders found for this customer.
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Small Components
   ═══════════════════════════════════════════ */

function KPI({
  label,
  value,
  large,
}: {
  label: string;
  value: string | number;
  large?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div
        className={clsx(
          "font-semibold text-gray-900 tabular-nums",
          large ? "text-xl" : "text-sm"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium text-gray-700">{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */

function build24MonthSeries(raw: MonthlyRow[] = []) {
  const now = new Date();
  const months: { month: string; orders: number; revenue: number }[] = [];
  const lookup = new Map(raw.map((r) => [r.month_key, r]));

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const match = lookup.get(key);
    months.push({
      month: key,
      orders: match?.orders ?? 0,
      revenue: Number(match?.revenue ?? 0),
    });
  }

  return months;
}
