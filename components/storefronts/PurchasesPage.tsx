"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Receipt } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { orderRef, type StorefrontOrder } from "@/lib/storefrontOrder";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Purchases from both storefronts. Reads the wholesale project's `orders`
 * table, which doesn't exist until checkout ships — until then this is an
 * honest empty state that activates by itself once orders start landing.
 */
export default function PurchasesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<StorefrontOrder[]>([]);
  const [notReady, setNotReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/storefront-orders", {
        headers: await authHeader(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setError(null);
      setNotReady(!!json.notReady);
      setOrders(json.orders as StorefrontOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Purchases</h1>
        <p className="mt-1 text-sm text-gray-500">
          Orders from redek.io and naturalinspirations.com — retail and
          wholesale.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading orders…
        </div>
      ) : notReady ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <Receipt size={24} className="mx-auto text-gray-300" />
          <h2 className="mt-3 text-sm font-medium text-gray-900">
            Orders table isn&apos;t set up yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            Run the wholesale-project SQL snippet to create the orders
            table. Once it exists, purchases from both storefronts appear
            here automatically — order number, buyer, items, totals, and
            status.
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          No orders yet. They&apos;ll show up here the moment the first one
          lands.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2.5 font-medium">Order</th>
                <th className="px-3 py-2.5 font-medium">Placed</th>
                <th className="px-3 py-2.5 font-medium">Channel</th>
                <th className="px-3 py-2.5 font-medium">Buyer</th>
                <th className="px-3 py-2.5 text-right font-medium">Items</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const units = (o.items ?? []).reduce(
                  (s, l) => s + (l?.quantity ?? 0),
                  0
                );
                const wholesale = o.channel === "wholesale";
                return (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/storefronts/purchases/${o.id}`)}
                    className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-gray-900">
                      {orderRef(o)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          wholesale
                            ? "inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                            : "inline-flex rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700"
                        }
                      >
                        {o.channel ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-900">
                        {o.business_name || o.contact_name || "Guest"}
                      </div>
                      {o.email ? (
                        <div className="text-gray-400">{o.email}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                      {units || (o.items?.length ?? 0) || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                      {o.total != null ? `$${Number(o.total).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium capitalize text-gray-700">
                        {o.status ?? "—"}
                      </span>
                      {o.payment_status && o.payment_status !== "paid" ? (
                        <span className="ml-1.5 inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          {o.payment_status === "unpaid"
                            ? "unpaid · test"
                            : o.payment_status}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
