"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Receipt,
  Search,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  fulfillmentState,
  orderRef,
  orderSource,
  ORDER_SOURCE_LABELS,
  type FulfillmentKey,
  type OrderSourceKey,
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

/** Format a ship date (date-only `scheduled_ship_date` or a `shipped_at`
 *  timestamp) as M/D/YY from its leading YYYY-MM-DD — no Date() parsing, so no
 *  timezone day-shift (shipped_at is stored at noon UTC for exactly this). */
function fmtShipDate(value?: string | null): string {
  const m = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}`;
}

/** Sortable table columns, in display order. */
type SortKey =
  | "order"
  | "placed"
  | "shipby"
  | "shipped"
  | "channel"
  | "buyer"
  | "items"
  | "total"
  | "status"
  | "payment";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "order", label: "Order" },
  { key: "placed", label: "Placed" },
  { key: "shipby", label: "Ship by" },
  { key: "shipped", label: "Shipped" },
  { key: "channel", label: "Channel" },
  { key: "buyer", label: "Buyer" },
  { key: "items", label: "Items", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "status", label: "Status" },
  { key: "payment", label: "Payment" },
];

/** Label + pill colours for a payment_status value (null → no pill). */
function paymentMeta(status?: string | null): { label: string; badge: string } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "paid") return { label: "paid", badge: "bg-emerald-50 text-emerald-700" };
  if (s === "unpaid") return { label: "unpaid · test", badge: "bg-amber-50 text-amber-700" };
  return { label: status, badge: "bg-gray-100 text-gray-600" };
}

/** Date/number columns default to descending on first click; text ascending. */
const DESC_FIRST: SortKey[] = ["placed", "shipby", "shipped", "items", "total"];

/** Pipeline order, so sorting by Status groups the buckets logically. */
const STATUS_RANK: Record<string, number> = {
  "needs-fishbowl": 0,
  "needs-tracking": 1,
  shipped: 2,
  cancelled: 3,
};

/** The comparable value for a given order + column. */
function sortValue(o: StorefrontOrder, key: SortKey): string | number {
  switch (key) {
    case "order":
      return orderRef(o).toLowerCase();
    case "placed":
      return new Date(o.created_at).getTime() || 0;
    case "shipby":
      return o.scheduled_ship_date ? Date.parse(o.scheduled_ship_date) || 0 : 0;
    case "shipped":
      return o.shipped_at ? Date.parse(o.shipped_at) || 0 : 0;
    case "channel":
      return (o.channel ?? "").toLowerCase();
    case "buyer":
      return (o.business_name || o.contact_name || "").toLowerCase();
    case "items":
      return (o.items ?? []).reduce((s, l) => s + (l?.quantity ?? 0), 0);
    case "total":
      return Number(o.total ?? 0);
    case "status":
      return STATUS_RANK[fulfillmentState(o).key] ?? 9;
    case "payment":
      return (o.payment_status ?? "").toLowerCase();
  }
}

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
  const [sourceFilter, setSourceFilter] = useState<"all" | OrderSourceKey>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("placed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      setSortDir((prevDir) =>
        prevKey === key ? (prevDir === "asc" ? "desc" : "asc") : DESC_FIRST.includes(key) ? "desc" : "asc",
      );
      return key;
    });
    setPage(0);
  }, []);
  /** "orders" = completed business; "abandoned" = unpaid D2C checkout-starts
   *  (the abandoned-cart material — win-back targets, not real orders). */
  const [view, setView] = useState<"orders" | "abandoned">("orders");

  const reload = useCallback(async () => {
    try {
      const res = await fetch(
        view === "abandoned"
          ? "/api/storefront-orders?view=abandoned"
          : "/api/storefront-orders",
        {
          headers: await authHeader(),
        },
      );
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
  }, [view]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  // Everything matching search + source + channel (but NOT the state tab), so
  // the tab counts reflect the other active filters. Marketplace orders arrive
  // via their crons (faire-order-sync / markettime-order-sync); there are no
  // manual pull buttons here.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (channelFilter !== "all" && o.channel !== channelFilter) return false;
      if (sourceFilter !== "all" && orderSource(o) !== sourceFilter) return false;
      if (paymentFilter !== "all" && (o.payment_status ?? "") !== paymentFilter) return false;
      if (q) {
        const hay = [orderRef(o), o.business_name, o.contact_name, o.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, query, channelFilter, sourceFilter, paymentFilter]);

  // Distinct payment_status values present, for the filter dropdown.
  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.payment_status) set.add(o.payment_status);
    return Array.from(set).sort();
  }, [orders]);

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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = sorted.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );
  const from = sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(sorted.length, (safePage + 1) * PAGE_SIZE);

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          {view === "abandoned"
            ? "Checkouts that were started but never paid — abandoned-cart material, not real orders."
            : "Orders from sassyandco.com, naturalinspirations.com, Faire, and MarketTime — D2C and wholesale."}
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
          {(
            [
              { key: "orders", label: "Orders" },
              { key: "abandoned", label: "Abandoned carts" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setView(t.key);
                setPage(0);
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                view === t.key
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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

            <div className="ml-auto flex items-center gap-2">
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value as typeof sourceFilter);
                  setPage(0);
                }}
                className={selectCls}
              >
                <option value="all">All sources</option>
                <option value="markettime">{ORDER_SOURCE_LABELS.markettime}</option>
                <option value="faire">{ORDER_SOURCE_LABELS.faire}</option>
                <option value="sassy">{ORDER_SOURCE_LABELS.sassy}</option>
                <option value="ni">{ORDER_SOURCE_LABELS.ni}</option>
              </select>
              <select
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value as typeof channelFilter);
                  setPage(0);
                }}
                className={selectCls}
              >
                <option value="all">All channels</option>
                <option value="d2c">D2C</option>
                <option value="wholesale">Wholesale</option>
              </select>
              <select
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value as typeof stateFilter);
                  setPage(0);
                }}
                className={selectCls}
              >
                {STATE_TABS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} ({counts[t.key] ?? 0})
                  </option>
                ))}
              </select>
              <select
                value={paymentFilter}
                onChange={(e) => {
                  setPaymentFilter(e.target.value);
                  setPage(0);
                }}
                className={selectCls}
              >
                <option value="all">All payments</option>
                {paymentOptions.map((p) => (
                  <option key={p} value={p}>
                    {p === "unpaid" ? "unpaid · test" : p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  {COLUMNS.map((col) => {
                    const active = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        className={`px-3 py-2.5 font-medium ${col.align === "right" ? "text-right" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          title={`Sort by ${col.label}`}
                          className={`inline-flex items-center gap-1 uppercase tracking-wider ${
                            col.align === "right" ? "flex-row-reverse" : ""
                          } ${active ? "text-gray-700" : "hover:text-gray-600"}`}
                        >
                          {col.label}
                          {active ? (
                            sortDir === "asc" ? (
                              <ChevronUp size={11} />
                            ) : (
                              <ChevronDown size={11} />
                            )
                          ) : (
                            <ArrowUpDown size={11} className="opacity-30" />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
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
                    const payment = paymentMeta(o.payment_status);
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
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                          {fmtShipDate(o.scheduled_ship_date)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                          {fmtShipDate(o.shipped_at)}
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
                          {/* Marketplace orders: which Fishbowl customer the
                              estimate will book under — or the no-match flag. */}
                          {o.source === "faire" || o.source === "markettime" ? (
                            o.fishbowl_customer ? (
                              <div className="text-[11px] text-emerald-700">
                                → {String(o.fishbowl_customer)}
                              </div>
                            ) : (
                              <span className="mt-0.5 inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                                No customer match
                              </span>
                            )
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
                        </td>
                        <td className="px-3 py-2.5">
                          {payment ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${payment.badge}`}
                            >
                              {payment.label}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
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
