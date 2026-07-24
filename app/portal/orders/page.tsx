"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, Search, Truck, X } from "lucide-react";
import {
  portalGet,
  usd,
  shortDate,
  type OrderStage,
  type PortalOrder,
  type PortalOrderItem,
} from "@/components/portal/api";

/**
 * Order history for the rep's own accounts.
 *
 * Exists so a rep can answer "where's my order?" on the spot instead of
 * relaying it to the office. Search covers order number, the customer's PO,
 * and the ship-to name — the three things a customer actually quotes down the
 * phone.
 */

/* Fishbowl's SOSTATUS names, grouped by what they mean to a rep. Anything
   unrecognised renders neutral rather than guessing. */
const STATUS_TONE: Record<string, string> = {
  fulfilled: "bg-emerald-50 text-emerald-700",
  shipped: "bg-emerald-50 text-emerald-700",
  closed: "bg-emerald-50 text-emerald-700",
  "closed short": "bg-amber-50 text-amber-700",
  picked: "bg-blue-50 text-blue-700",
  packed: "bg-blue-50 text-blue-700",
  "in progress": "bg-blue-50 text-blue-700",
  entered: "bg-gray-100 text-gray-600",
  issued: "bg-gray-100 text-gray-600",
  void: "bg-rose-50 text-rose-700",
  cancelled: "bg-rose-50 text-rose-700",
  expired: "bg-rose-50 text-rose-700",
};

function statusClass(status: string | null): string {
  if (!status) return "bg-gray-100 text-gray-500";
  return STATUS_TONE[status.trim().toLowerCase()] ?? "bg-gray-100 text-gray-600";
}

type StageFilter = "all" | OrderStage;

/* "Open" leads because it's the reason a customer calls. Cancelled is last and
   unlabelled by count — nobody browses void orders, they look one up. */
const STAGE_FILTERS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "estimate", label: "Estimates" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/** What the date column means for an order at this stage. */
const DATE_LABEL: Record<OrderStage, string> = {
  estimate: "Created",
  open: "Issued",
  completed: "Completed",
  cancelled: "Created",
};

export default function PortalOrders() {
  const [orders, setOrders] = useState<PortalOrder[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [counts, setCounts] = useState<Record<OrderStage, number> | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PortalOrder | null>(null);

  /* Search runs server-side so a rep can find an order from any year, not just
     whatever the recent page happened to load. */
  const reqId = useRef(0);
  const load = useCallback(async (q: string, st: StageFilter) => {
    const mine = ++reqId.current;
    setSearching(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (st !== "all") qs.set("stage", st);
      const path = qs.toString()
        ? `/api/portal/orders?${qs.toString()}`
        : "/api/portal/orders";
      const d = await portalGet<{
        orders: PortalOrder[];
        truncated: boolean;
        counts: Record<OrderStage, number>;
      }>(path);
      // Ignore results from a query the user has already typed past.
      if (mine !== reqId.current) return;
      setOrders(d.orders);
      setTruncated(d.truncated);
      setCounts(d.counts ?? null);
      setError(null);
    } catch (e) {
      if (mine !== reqId.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === reqId.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search, stage), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, stage, load]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Orders
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Order history for your accounts — search by order number, PO, or
          ship-to name.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {STAGE_FILTERS.map((f) => {
          const active = stage === f.value;
          const n =
            f.value === "all"
              ? counts
                ? Object.values(counts).reduce((s, v) => s + v, 0)
                : null
              : (counts?.[f.value] ?? null);
          return (
            <button
              key={f.value}
              onClick={() => setStage(f.value)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {f.label}
              {n !== null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${
                    active ? "bg-white/20" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order #, customer PO, ship-to…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        />
        {searching ? (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
          />
        ) : search ? (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ship to</th>
              <th className="px-4 py-3 text-right">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!orders && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {orders && orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  {search
                    ? `No orders match “${search.trim()}”.`
                    : "No orders yet."}
                </td>
              </tr>
            )}
            {orders?.map((o) => (
              <tr
                key={`${o.id}-${o.num}`}
                onClick={() => setSelected(o)}
                className="cursor-pointer transition hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{o.num ?? "—"}</div>
                  {o.customerpo && (
                    <div className="text-xs text-gray-400">PO {o.customerpo}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {o.customer_name ?? o.customerid ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(o.status)}`}
                  >
                    {o.status ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {o.shiptocity || o.shiptostate
                    ? [o.shiptocity, o.shiptostate].filter(Boolean).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  <div>{shortDate(o.effective_date)}</div>
                  <div className="text-xs text-gray-400">
                    {DATE_LABEL[o.stage]}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {usd(o.totalprice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {orders && (
        <p className="text-center text-xs text-gray-400">
          {truncated
            ? `Showing the first ${orders.length.toLocaleString()} — narrow your search to see more.`
            : `${orders.length.toLocaleString()} order${orders.length === 1 ? "" : "s"}`}
        </p>
      )}

      {selected && (
        <OrderDrawer order={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function OrderDrawer({
  order,
  onClose,
}: {
  order: PortalOrder;
  onClose: () => void;
}) {
  const [items, setItems] = useState<PortalOrderItem[] | null>(null);
  const [detail, setDetail] = useState<PortalOrder>(order);

  useEffect(() => {
    let cancelled = false;
    if (!order.num) return;
    portalGet<{ order: PortalOrder; items: PortalOrderItem[] }>(
      `/api/portal/orders?num=${encodeURIComponent(order.num)}`,
    )
      .then((d) => {
        if (cancelled) return;
        setDetail(d.order);
        setItems(d.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [order.num]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shipTo = [
    detail.shiptoname,
    detail.shiptoaddress,
    [detail.shiptocity, detail.shiptostate, detail.shiptozip]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900">
              Order {detail.num}
            </div>
            <div className="truncate text-xs text-gray-400">
              {detail.customer_name ?? detail.customerid}
              {detail.customerpo ? ` · PO ${detail.customerpo}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* Where is it — the reason this page exists */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Status
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-sm font-medium ${statusClass(detail.status)}`}
              >
                {detail.status ?? "Unknown"}
              </span>
              <span className="text-sm text-gray-500">
                {DATE_LABEL[detail.stage]} {shortDate(detail.effective_date)}
              </span>
            </div>

            {/* An open order's whole story is its dates, so show the ones set. */}
            {detail.stage !== "completed" && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {detail.datecreated && (
                  <span>Created {shortDate(detail.datecreated)}</span>
                )}
                {detail.dateissued && (
                  <span>Issued {shortDate(detail.dateissued)}</span>
                )}
              </div>
            )}

            {detail.tracking ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <Truck size={15} className="mt-0.5 shrink-0 text-gray-500" />
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">
                    {detail.tracking.label}
                  </div>
                  <div className="break-all font-mono text-sm text-gray-900">
                    {detail.tracking.value}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-400">
                No tracking number recorded for this order.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Ship to
            </h3>
            {shipTo.length > 0 ? (
              <div className="space-y-0.5 text-sm text-gray-700">
                {shipTo.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No ship-to on file.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Items
            </h3>
            {items === null ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-400">No line items on file.</p>
            ) : (
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div
                    key={`${it.productnum}-${it.solineitem}-${i}`}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 p-3"
                  >
                    <Package size={15} className="mt-0.5 shrink-0 text-gray-300" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {it.description || it.productnum || "—"}
                      </div>
                      {it.productnum && (
                        <div className="font-mono text-xs text-gray-400">
                          {it.productnum}
                        </div>
                      )}
                      <div className="mt-0.5 text-xs text-gray-500">
                        {(it.qtyfulfilled ?? 0).toLocaleString()} of{" "}
                        {(it.qtyordered ?? 0).toLocaleString()} shipped
                      </div>
                    </div>
                    <div className="shrink-0 text-sm tabular-nums text-gray-700">
                      {usd(it.totalprice)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Order total</span>
              <span className="text-base font-semibold text-gray-900">
                {usd(detail.totalprice)}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
