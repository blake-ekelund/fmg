"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Printer,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  composeInvoiceLines,
  fulfillmentState,
  orderRef,
  type OrderAddress,
  type StorefrontOrder,
} from "@/lib/storefrontOrder";
import { CARRIER_OPTIONS, carrierLabel, trackingUrl } from "@/lib/tracking";

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

  /** One PATCH to the order; refreshes local state on success. Returns
   *  whether it saved so callers (e.g. the shipment editor) can react. */
  const patchOrder = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await fetch(`/api/storefront-orders/${orderId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeader()),
          },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? `Failed (${res.status})`);
          return false;
        }
        setError(null);
        setOrder(json.order as StorefrontOrder);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [orderId]
  );

  const enterFishbowl = () => patchOrder({ action: "enter-fishbowl" });
  const clearFishbowl = () => patchOrder({ action: "clear-fishbowl" });
  const saveTracking = (carrier: string, tracking_code: string) =>
    patchOrder({ action: "set-tracking", carrier, tracking_code });
  const clearTracking = () => patchOrder({ action: "clear-tracking" });

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
  const inFishbowl = Boolean(order.fishbowl_entered_at);
  const fulfillment = fulfillmentState(order);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
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
          {inFishbowl ? (
            <button
              type="button"
              onClick={clearFishbowl}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Undo Fishbowl
            </button>
          ) : (
            <button
              type="button"
              onClick={enterFishbowl}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              Mark in Fishbowl
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

      {/* Invoice — `print-document` is the only thing that prints (globals.css) */}
      <div className="print-document rounded-2xl border border-gray-200 bg-white p-8">
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
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${fulfillment.badge}`}
            >
              {fulfillment.label}
            </span>
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

        {/* Shipment — deep-link carrier tracking, recorded once it ships */}
        <Shipment
          order={order}
          saving={saving}
          onSave={saveTracking}
          onClear={clearTracking}
        />

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

        {/* Fishbowl entry — the fulfillment gate that replaces "approved" */}
        <div className="mt-6 border-t border-gray-100 pt-4">
          {inFishbowl ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={15} />
              Entered into Fishbowl by{" "}
              <span className="font-medium">
                {order.fishbowl_entered_by ?? "—"}
              </span>{" "}
              on{" "}
              {order.fishbowl_entered_at
                ? new Date(order.fishbowl_entered_at).toLocaleString()
                : "—"}
            </div>
          ) : (
            <div className="text-sm text-gray-400">
              Not yet entered into Fishbowl.
            </div>
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

/**
 * Shipment tracking — the team records a carrier + tracking number once the
 * order ships, and the saved view links straight to the carrier's own page
 * (no carrier API). The link also prints, so a packing slip carries it.
 */
function Shipment({
  order,
  saving,
  onSave,
  onClear,
}: {
  order: StorefrontOrder;
  saving: boolean;
  onSave: (carrier: string, code: string) => Promise<boolean>;
  onClear: () => Promise<boolean>;
}) {
  const hasTracking = Boolean(order.carrier && order.tracking_code);
  const [editing, setEditing] = useState(!hasTracking);
  const [carrier, setCarrier] = useState(order.carrier ?? "");
  const [code, setCode] = useState(order.tracking_code ?? "");
  const url = trackingUrl(order.carrier, order.tracking_code);

  if (hasTracking && !editing) {
    return (
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Shipment
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="text-gray-900">{carrierLabel(order.carrier)}</span>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                {order.tracking_code}
                <ExternalLink size={12} className="print:hidden" />
              </a>
            ) : (
              <span className="font-mono text-gray-700">
                {order.tracking_code}
              </span>
            )}
            {order.shipped_at ? (
              <span className="text-xs text-gray-400">
                · shipped{" "}
                {new Date(order.shipped_at).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 print:hidden"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 py-4 print:hidden">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Shipment
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
        >
          <option value="">Carrier…</option>
          {CARRIER_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Tracking number"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-sm text-gray-900 placeholder:font-sans placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={saving || !carrier || !code.trim()}
          onClick={async () => {
            if (await onSave(carrier, code.trim())) setEditing(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Save
        </button>
        {hasTracking ? (
          <>
            <button
              type="button"
              onClick={() => {
                setCarrier(order.carrier ?? "");
                setCode(order.tracking_code ?? "");
                setEditing(false);
              }}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (await onClear()) {
                  setCarrier("");
                  setCode("");
                  setEditing(false);
                }
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Clear
            </button>
          </>
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
