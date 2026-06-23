"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Receipt,
  Search,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  fulfillmentState,
  orderRef,
  type FulfillmentKey,
  type StorefrontOrder,
} from "@/lib/storefrontOrder";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const PAGE_SIZE = 25;

/** Fulfillment buckets shown as filter tabs (doubles as a colour legend). */
const STATE_TABS: { key: "all" | FulfillmentKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-fishbowl", label: "Needs Fishbowl" },
  { key: "needs-tracking", label: "Needs tracking" },
  { key: "shipped", label: "Shipped" },
];

/**
 * Purchases from both storefronts. Reads the wholesale project's `orders`
 * table, which doesn't exist until checkout ships — until then this is an
 * honest empty state that activates by itself once orders start landing.
 * Filtering + pagination are client-side (the API returns the latest 200,
 * which is plenty at current volume).
 */
export default function PurchasesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<StorefrontOrder[]>([]);
  const [notReady, setNotReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters + page
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | FulfillmentKey>("all");
  const [channelFilter, setChannelFilter] = useState<
    "all" | "d2c" | "wholesale"
  >("all");
  const [storeFilter, setStoreFilter] = useState<"all" | "sassy" | "ni">("all");
  const [page, setPage] = useState(0);

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

  // Everything matching search + channel + store (but NOT the state tab), so
  // the tab counts reflect the other active filters.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (channelFilter !== "all" && o.channel !== channelFilter) return false;
      if (storeFilter !== "all" && (o.store ?? "") !== storeFilter) return false;
      if (q) {
        const hay = [orderRef(o), o.business_name, o.contact_name, o.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, query, channelFilter, storeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length };
    for (const o of base) {
      const k = fulfillmentState(o).key;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [base]);

  const filtered = useMemo(
    () =>
      stateFilter === "all"
        ? base
        : base.filter((o) => fulfillmentState(o).key === stateFilter),
    [base, stateFilter]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Purchases</h1>
        <p className="mt-1 text-sm text-gray-500">
          Orders from sassyandco.com and naturalinspirations.com — retail and
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
            Run the wholesale-project SQL snippet to create the orders table.
            Once it exists, purchases from both storefronts appear here
            automatically — order number, buyer, items, totals, and status.
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          No orders yet. They&apos;ll show up here the moment the first one
          lands.
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search order #, buyer, email"
                className="w-72 rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {STATE_TABS.map((t) => {
                const active = stateFilter === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setStateFilter(t.key);
                      setPage(0);
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      active
                        ? "bg-gray-900 text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t.label}
                    <span
                      className={
                        active ? "ml-1 text-gray-300" : "ml-1 text-gray-400"
                      }
                    >
                      {counts[t.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value as typeof channelFilter);
                  setPage(0);
                }}
                className={selectCls}
              >
                <option value="all">All channels</option>
                <option value="d2c">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
              <select
                value={storeFilter}
                onChange={(e) => {
                  setStoreFilter(e.target.value as typeof storeFilter);
                  setPage(0);
                }}
                className={selectCls}
              >
                <option value="all">Both stores</option>
                <option value="sassy">Sassy</option>
                <option value="ni">NI</option>
              </select>
            </div>
          </div>

          {/* Table */}
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
                  <th className="px-3 py-2.5 font-medium">Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-sm text-gray-400"
                    >
                      No orders match these filters.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((o) => {
                    const units = (o.items ?? []).reduce(
                      (s, l) => s + (l?.quantity ?? 0),
                      0
                    );
                    const wholesale = o.channel === "wholesale";
                    const f = fulfillmentState(o);
                    return (
                      <tr
                        key={o.id}
                        onClick={() =>
                          router.push(`/storefronts/purchases/${o.id}`)
                        }
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
                          {o.total != null
                            ? `$${Number(o.total).toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${f.badge}`}
                          >
                            {f.label}
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
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {filtered.length === 0
                ? "No orders"
                : `Showing ${from}–${to} of ${filtered.length}`}
            </span>
            {pageCount > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="px-1">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
