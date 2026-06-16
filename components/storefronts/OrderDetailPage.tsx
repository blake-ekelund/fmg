"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Printer,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  composeInvoiceLines,
  orderRef,
  type OrderAddress,
  type StorefrontOrder,
} from "@/lib/storefrontOrder";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const money = (n?: number | null) =>
  n == null ? "—" : `$${Number(n).toFixed(2)}`;

export default function OrderDetailPage({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<StorefrontOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/storefront-orders/${orderId}`, {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setError(null);
      setOrder(json.order as StorefrontOrder);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [orderId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function setApproval(action: "approve" | "unapprove") {
    setSaving(true);
    try {
      const res = await fetch(`/api/storefront-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setError(null);
      setOrder(json.order as StorefrontOrder);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-400">
        <Loader2 size={15} className="animate-spin" /> Loading order…
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <BackLink />
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (!order) return null;

  const wholesale = order.channel === "wholesale";
  const lines = composeInvoiceLines(order);
  const approved = Boolean(order.approved_at);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      {/* Action bar — hidden when printing */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <BackLink />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Printer size={14} /> Print
          </button>
          {approved ? (
            <button
              type="button"
              onClick={() => setApproval("unapprove")}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Unapprove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setApproval("approve")}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              Approve
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Invoice */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-gray-900">
              {orderRef(order)}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {new Date(order.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={
                wholesale
                  ? "inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700"
                  : "inline-flex rounded-full bg-pink-50 px-2.5 py-0.5 text-[11px] font-medium text-pink-700"
              }
            >
              {order.channel ?? "—"}
            </span>
            {order.payment_status && order.payment_status !== "paid" ? (
              <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                {order.payment_status === "unpaid"
                  ? "unpaid · test mode"
                  : order.payment_status}
              </span>
            ) : null}
            {order.status ? (
              <span className="text-[11px] capitalize text-gray-500">
                {order.status}
              </span>
            ) : null}
          </div>
        </div>

        {/* Bill to / Ship to */}
        <div className="grid grid-cols-2 gap-6 py-5">
          <AddressBlock
            title="Bill to"
            addr={order.bill_to}
            fallback={
              wholesale
                ? order.business_name ?? order.contact_name ?? "—"
                : order.contact_name ?? order.email ?? "—"
            }
          />
          <AddressBlock
            title="Ship to"
            addr={order.ship_to}
            fallback="Confirmed by email"
          />
        </div>

        {/* Meta */}
        <div className="grid grid-cols-3 gap-4 border-y border-gray-100 py-4 text-sm">
          <Meta label="Sales rep" value={order.sales_rep ?? "—"} />
          <Meta label="Payment terms" value={order.payment_terms ?? "—"} />
          <Meta
            label="Contact"
            value={order.email ?? order.phone ?? "—"}
          />
        </div>

        {/* Line items */}
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Type</th>
              <th className="py-2 pr-2 font-medium">Product</th>
              <th className="py-2 pr-2 font-medium">Description</th>
              <th className="py-2 pr-2 text-right font-medium">Unit</th>
              <th className="py-2 pr-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr
                key={`${l.kind}-${l.lineNo}`}
                className="border-b border-gray-50 last:border-0"
              >
                <td className="py-2 pr-2 tabular-nums text-gray-400">
                  {l.lineNo}
                </td>
                <td className="py-2 pr-2">
                  <span
                    className={
                      l.kind === "Sale"
                        ? "text-gray-600"
                        : l.kind === "Discount"
                          ? "text-emerald-700"
                          : "text-gray-500"
                    }
                  >
                    {l.kind}
                  </span>
                </td>
                <td className="py-2 pr-2 font-mono text-xs text-gray-500">
                  {l.part}
                </td>
                <td className="py-2 pr-2 text-gray-900">{l.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-gray-600">
                  {l.unitPrice == null ? "—" : money(l.unitPrice)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-gray-600">
                  {l.quantity ?? "—"}
                </td>
                <td className="py-2 text-right font-medium tabular-nums text-gray-900">
                  {money(l.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex justify-end">
          <dl className="w-56 space-y-1.5 text-sm">
            <Total label="Subtotal" value={money(order.subtotal)} />
            {order.discount && order.discount > 0 ? (
              <Total
                label="Discount"
                value={`−${money(order.discount)}`}
                accent
              />
            ) : null}
            <Total
              label="Shipping"
              value={
                order.shipping == null
                  ? "—"
                  : order.shipping === 0
                    ? "Free"
                    : money(order.shipping)
              }
            />
            <Total label="Tax" value={money(order.tax ?? 0)} />
            <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Total
              </dt>
              <dd className="text-lg font-bold tabular-nums text-gray-900">
                {money(order.total)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Approval */}
        <div className="mt-6 border-t border-gray-100 pt-4">
          {approved ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={15} />
              Approved by{" "}
              <span className="font-medium">{order.approved_by ?? "—"}</span> on{" "}
              {order.approved_at
                ? new Date(order.approved_at).toLocaleString()
                : "—"}
            </div>
          ) : (
            <div className="text-sm text-gray-400">Not yet approved.</div>
          )}
        </div>

        {order.note ? (
          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <span className="font-medium text-gray-600">Note:</span>{" "}
            {order.note}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/storefronts/purchases"
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
    >
      <ArrowLeft size={15} /> Purchases
    </Link>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-gray-900">{value}</div>
    </div>
  );
}

function Total({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`tabular-nums ${accent ? "font-medium text-emerald-700" : "text-gray-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function AddressBlock({
  title,
  addr,
  fallback,
}: {
  title: string;
  addr?: OrderAddress | null;
  fallback?: string;
}) {
  const hasAddr = addr && (addr.line1 || addr.city);
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </div>
      {hasAddr ? (
        <div className="mt-1 space-y-0.5 text-sm text-gray-700">
          {addr!.company ? (
            <div className="font-medium text-gray-900">{addr!.company}</div>
          ) : null}
          {addr!.name ? (
            <div className={addr!.company ? "" : "font-medium text-gray-900"}>
              {addr!.name}
            </div>
          ) : null}
          {addr!.line1 ? <div>{addr!.line1}</div> : null}
          {addr!.line2 ? <div>{addr!.line2}</div> : null}
          <div>
            {[
              [addr!.city, addr!.state].filter(Boolean).join(", "),
              addr!.postal_code,
            ]
              .filter(Boolean)
              .join(" ")}
          </div>
          {addr!.country && addr!.country !== "US" ? (
            <div>{addr!.country}</div>
          ) : null}
          {addr!.phone ? <div className="text-gray-500">{addr!.phone}</div> : null}
          {addr!.email ? <div className="text-gray-500">{addr!.email}</div> : null}
        </div>
      ) : (
        <div className="mt-1 text-sm text-gray-400">{fallback ?? "—"}</div>
      )}
    </div>
  );
}
