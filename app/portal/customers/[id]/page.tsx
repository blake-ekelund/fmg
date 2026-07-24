"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import {
  portalGet,
  portalHref,
  usd,
  shortDate,
  customerStatus,
  type PortalContact,
  type PortalCustomer,
  type PortalOrder,
} from "@/components/portal/api";
import ChannelIcon from "@/components/portal/ChannelIcon";

/**
 * One customer, in depth.
 *
 * The list answers "who should I call"; this answers "what do I say when they
 * pick up" — the trend across four years, what they buy, what's in flight, and
 * how to reach them, without the rep having to hold three tabs open.
 */

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  at_risk: "At risk",
  churned: "Churned",
  none: "No orders",
};
const STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  churned: "bg-rose-50 text-rose-700",
  none: "bg-gray-100 text-gray-500",
};

const YEARS = [2023, 2024, 2025, 2026] as const;

function pct(cur: number, prior: number): number | null {
  if (!prior) return null;
  return ((cur - prior) / Math.abs(prior)) * 100;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export default function PortalCustomerDetail() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));

  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [orders, setOrders] = useState<PortalOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    portalGet<{ customer: PortalCustomer; contact: PortalContact | null }>(
      `/api/portal/customers?id=${encodeURIComponent(id)}`,
    )
      .then((d) => {
        setCustomer(d.customer);
        setContact(d.contact);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  /* Their orders, newest first. Searching by customer id would also match other
     fields, so this filters the agency-scoped list client-side. */
  useEffect(() => {
    if (!id) return;
    portalGet<{ orders: PortalOrder[] }>("/api/portal/orders")
      .then((d) => setOrders(d.orders.filter((o) => o.customerid === id)))
      .catch(() => setOrders([]));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  const status = customerStatus(customer.last_order_date, customer.has_open_order);
  const since = daysSince(customer.last_order_date);
  const yoy = pct(customer.sales_2026 ?? 0, customer.sales_2025 ?? 0);
  const peak = Math.max(
    ...YEARS.map((y) => customer[`sales_${y}` as const] ?? 0),
    1,
  );

  const address = [
    contact?.billto_address,
    [contact?.billto_city, contact?.billto_state, contact?.billto_zip]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);

  const liveOrders = orders?.filter(
    (o) => o.stage === "open" || o.stage === "estimate",
  );

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
            <ChannelIcon channel={customer.channel} size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-900">
              {customer.name}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {customer.customerid}
              {customer.channel ? ` · ${customer.channel}` : ""}
              {customer.bill_to_state ? ` · ${customer.bill_to_state}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
          {customer.has_open_order && (
            <span className="text-xs text-gray-500">
              Has an order in progress
            </span>
          )}
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="2026 sales" value={usd(customer.sales_2026)} />
        <Stat
          label="vs 2025"
          value={
            yoy === null
              ? "—"
              : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(0)}%`
          }
          tone={yoy === null ? undefined : yoy >= 0 ? "good" : "bad"}
          sub={usd(customer.sales_2025)}
        />
        <Stat
          label="Last order"
          value={shortDate(customer.last_order_date)}
          sub={since === null ? undefined : `${since} days ago`}
          tone={since !== null && since > 180 ? "bad" : undefined}
        />
        <Stat
          label="Lifetime"
          value={usd(customer.lifetime_revenue)}
          sub={`${(customer.lifetime_orders ?? 0).toLocaleString()} orders`}
        />
      </div>

      {/* Four-year trend — a bar per year beats a sparkline for four points */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Sales by year</h2>
        <div className="mt-4 space-y-2.5">
          {YEARS.map((y) => {
            const v = customer[`sales_${y}` as const] ?? 0;
            const isCurrent = y === 2026;
            return (
              <div key={y} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs tabular-nums text-gray-500">
                  {y}
                </span>
                <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-gray-50">
                  <div
                    className={`h-full rounded-md ${isCurrent ? "bg-brand-700" : "bg-gray-300"}`}
                    style={{ width: `${Math.max((v / peak) * 100, v > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-gray-900">
                  {usd(v)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          2026 is year-to-date and will look short against complete years.
        </p>
      </section>

      {/* In flight */}
      {liveOrders && liveOrders.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-gray-900">In progress</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Estimates and orders not yet completed.
            </p>
          </div>
          <ul className="divide-y divide-gray-50">
            {liveOrders.map((o) => (
              <li
                key={`${o.id}-${o.num}`}
                className="flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {o.num}
                  </div>
                  <div className="text-xs text-gray-500">
                    {o.status}
                    {o.customerpo ? ` · PO ${o.customerpo}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums text-gray-900">
                  {usd(o.totalprice)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent orders */}
      <section className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-900">Recent orders</h2>
          <Link
            href={portalHref(`/portal/orders?q=${encodeURIComponent(customer.name)}`)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            All orders
            <ArrowRight size={12} />
          </Link>
        </div>
        {orders === null ? (
          <p className="px-5 py-6 text-sm text-gray-400">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">
            No orders found in the recent window.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {orders.slice(0, 10).map((o) => (
              <li
                key={`${o.id}-${o.num}`}
                className="flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{o.num}</div>
                  <div className="text-xs text-gray-500">
                    {o.status} · {shortDate(o.effective_date)}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums text-gray-900">
                  {usd(o.totalprice)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Contact */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
        {contact ? (
          <div className="mt-3 space-y-2 text-sm">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-2 text-brand-700 hover:underline"
              >
                <Mail size={14} className="shrink-0 text-gray-400" />
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-2 text-brand-700 hover:underline"
              >
                <Phone size={14} className="shrink-0 text-gray-400" />
                {contact.phone}
              </a>
            )}
            {address.length > 0 && (
              <div className="flex items-start gap-2 text-gray-600">
                <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <span>
                  {address.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {!contact.email && !contact.phone && address.length === 0 && (
              <p className="text-gray-400">No contact details on file.</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-400">
            No contact details on file.
          </p>
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href={portalHref("/portal/customers")}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900"
    >
      <ArrowLeft size={15} />
      My customers
    </Link>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          tone === "good"
            ? "text-emerald-600"
            : tone === "bad"
              ? "text-rose-600"
              : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}
