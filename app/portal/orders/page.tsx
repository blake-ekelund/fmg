"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Package,
  Search,
  Truck,
  X,
} from "@/components/portal/icons";
import {
  portalGet,
  portalDownload,
  usd,
  shortDate,
  type OrderStage,
  type PortalOrder,
  type PortalOrderItem,
} from "@/components/portal/api";
import { downloadInvoice } from "@/components/portal/invoiceDownload";
import { properCase } from "@/lib/textCase";

/**
 * Order history for the rep's own accounts.
 *
 * Exists so a rep can answer "where's my order?" on the spot instead of
 * relaying it to the office. Search covers order number, the customer's PO,
 * and the ship-to name — the three things a customer actually quotes down the
 * phone.
 */

/* Tone by stage, not raw Fishbowl status: the portal shows estimates, issued and
   in-progress orders all as one "Open" state, so their colour matches too. */
const STAGE_TONE: Record<OrderStage, string> = {
  estimate: "bg-blue-50 text-blue-700",
  open: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
};

/**
 * The badge text. Anything still live reads "Open" (the whole point — a rep
 * doesn't need "Issued" vs "In Progress" vs "Estimate"); finished and dead
 * orders keep their real Fishbowl status ("Fulfilled", "Void") because that
 * distinction is still useful.
 */
function badgeLabel(stage: OrderStage, status: string | null): string {
  if (stage === "open" || stage === "estimate") return "Open";
  return status ?? (stage === "completed" ? "Completed" : "Cancelled");
}

/** What the shown date actually is, from whichever timestamp is set. */
function dateLabel(o: Pick<PortalOrder, "datecompleted" | "dateissued" | "datecreated">): string {
  if (o.datecompleted) return "Completed";
  if (o.dateissued) return "Issued";
  if (o.datecreated) return "Created";
  return "";
}

/** The three portal stages a rep filters on ("estimate" is folded into "open"). */
type StageValue = "open" | "completed" | "cancelled";

/* "Open" leads because it's the reason a customer calls. Cancelled is last —
   nobody browses void orders, they look one up. */
const STAGE_OPTIONS: { value: StageValue; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STAGE_LABEL: Record<StageValue, string> = {
  open: "Open",
  completed: "Completed",
  cancelled: "Cancelled",
};

type StageCounts = Record<StageValue, number>;

export default function PortalOrders() {
  /* Deep link: /portal/orders?order=<num> (the assistant links orders this way)
     lands here, filters the list to that order, and auto-opens its drawer. ?q=
     just prefills the search box. Read off the URL rather than useSearchParams()
     to avoid forcing a Suspense boundary — matches the portal layout's pattern. */
  const deepLink =
    typeof window === "undefined"
      ? { order: null as string | null, q: null as string | null }
      : (() => {
          const p = new URLSearchParams(window.location.search);
          return { order: p.get("order"), q: p.get("q") };
        })();

  const [orders, setOrders] = useState<PortalOrder[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(deepLink.order ?? deepLink.q ?? "");
  // Multi-select stage. Empty set = all — stage filtering happens client-side
  // over the fetched page, so toggling it never costs a round trip and the
  // counts stay put while you pick.
  const [stageSel, setStageSel] = useState<Set<StageValue>>(() => new Set());
  const [counts, setCounts] = useState<StageCounts | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PortalOrder | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /* Search runs server-side so a rep can find an order from any year, not just
     whatever the recent page happened to load. */
  const reqId = useRef(0);
  const load = useCallback(async (q: string) => {
    const mine = ++reqId.current;
    setSearching(true);
    try {
      const path = q.trim()
        ? `/api/portal/orders?q=${encodeURIComponent(q.trim())}`
        : "/api/portal/orders";
      const d = await portalGet<{
        orders: PortalOrder[];
        truncated: boolean;
        counts: StageCounts;
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
    const t = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  /* Once the deep-linked order arrives in the list, open its drawer — one shot,
     so the rep can freely close it afterwards. */
  const openedDeepLink = useRef(false);
  useEffect(() => {
    if (openedDeepLink.current || !deepLink.order || !orders) return;
    const match = orders.find((o) => o.num === deepLink.order);
    if (match) {
      setSelected(match);
      openedDeepLink.current = true;
    }
  }, [orders, deepLink.order]);

  /* Stage filtering is client-side over the fetched page. */
  const visible = useMemo(() => {
    if (!orders) return orders;
    if (stageSel.size === 0) return orders;
    return orders.filter((o) => stageSel.has(o.stage as StageValue));
  }, [orders, stageSel]);

  /* Export the current view (same search + stage filters) to a two-sheet
     Excel workbook — Orders summary and Line Items — built server-side. */
  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("q", search.trim());
      if (stageSel.size) qs.set("stage", [...stageSel].join(","));
      const s = qs.toString();
      await portalDownload(
        `/api/portal/orders/export${s ? `?${s}` : ""}`,
        `orders_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header — title left, Export pinned top-right (matches Customers) */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Orders
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Order history for your accounts — search by order number, PO, or
            ship-to name.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !visible?.length}
          title="Export the current view to Excel"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Download size={13} />
          )}
          Export
        </button>
      </div>

      {/* Toolbar — search on the left, the stage filter to its right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order #, PO, customer, or city…"
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

        <StageMultiSelect
          selected={stageSel}
          counts={counts}
          onChange={setStageSel}
        />
      </div>

      {exportError && (
        <p className="text-xs text-red-600">{exportError}</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ship to</th>
              <th className="px-4 py-3 text-right">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right sr-only">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!visible && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {visible && visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  {search
                    ? `No orders match “${search.trim()}”.`
                    : stageSel.size > 0
                      ? "No orders in that filter."
                      : "No orders yet."}
                </td>
              </tr>
            )}
            {visible?.map((o) => (
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
                  {o.customer_name ? properCase(o.customer_name) : o.customerid ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_TONE[o.stage]}`}
                    >
                      {badgeLabel(o.stage, o.status)}
                    </span>
                    {o.tracking.some((t) => t.shipped) && (
                      <Truck
                        size={14}
                        className="shrink-0 text-gray-400"
                        aria-label="Shipped — tracking available"
                      />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {o.shiptocity || o.shiptostate
                    ? [properCase(o.shiptocity), o.shiptostate].filter(Boolean).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  <div>{shortDate(o.effective_date)}</div>
                  <div className="text-xs text-gray-400">
                    {dateLabel(o)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {usd(o.totalprice)}
                </td>
                <td className="px-2 py-3 text-right">
                  {o.num && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadInvoice(o.num!);
                      }}
                      title="Download invoice"
                      aria-label={`Download invoice for order ${o.num}`}
                      className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-800"
                    >
                      <Download size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible && (
        <p className="text-center text-xs text-gray-400">
          {truncated
            ? `Showing the first ${visible.length.toLocaleString()} — narrow your search to see more.`
            : `${visible.length.toLocaleString()} order${visible.length === 1 ? "" : "s"}`}
        </p>
      )}

      {selected && (
        <OrderDrawer order={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/**
 * Multi-select stage filter. Empty selection means "all".
 *
 * A dropdown rather than a pill row: it sits neatly to the right of the search
 * bar and lets a rep combine stages ("open plus completed") in one control.
 */
function StageMultiSelect({
  selected,
  counts,
  onChange,
}: {
  selected: Set<StageValue>;
  counts: StageCounts | null;
  onChange: (next: Set<StageValue>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(v: StageValue) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  }

  const allCount = counts ? counts.open + counts.completed + counts.cancelled : null;
  const label =
    selected.size === 0
      ? "All orders"
      : selected.size === 1
        ? STAGE_LABEL[[...selected][0]]
        : `${selected.size} stages`;
  const shown =
    counts == null
      ? null
      : selected.size === 0
        ? allCount
        : STAGE_OPTIONS.reduce(
            (s, o) => (selected.has(o.value) ? s + counts[o.value] : s),
            0,
          );

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium transition ${
          selected.size > 0
            ? "border-gray-900 text-gray-900"
            : "border-gray-200 text-gray-600 hover:border-gray-300"
        }`}
      >
        <span>{label}</span>
        {shown !== null && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] leading-none tabular-nums text-gray-500">
            {shown}
          </span>
        )}
        <ChevronDown
          size={13}
          className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
          >
            <span className="flex h-4 w-4 items-center justify-center">
              {selected.size === 0 && <Check size={13} className="text-gray-900" />}
            </span>
            <span
              className={selected.size === 0 ? "font-medium text-gray-900" : "text-gray-600"}
            >
              All orders
            </span>
            {allCount !== null && (
              <span className="ml-auto tabular-nums text-gray-400">{allCount}</span>
            )}
          </button>
          <div className="border-t border-gray-100">
            {STAGE_OPTIONS.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {on && <Check size={13} className="text-gray-900" />}
                  </span>
                  <span className="text-gray-700">{o.label}</span>
                  {counts && (
                    <span className="ml-auto tabular-nums text-gray-400">
                      {counts[o.value]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
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
    properCase(detail.shiptoname),
    properCase(detail.shiptoaddress),
    [properCase(detail.shiptocity), detail.shiptostate, detail.shiptozip]
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
              {detail.customer_name ? properCase(detail.customer_name) : detail.customerid}
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
          {detail.num && (
            <button
              onClick={() => downloadInvoice(detail.num!)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700"
            >
              <Download size={16} />
              Download invoice
            </button>
          )}

          {/* Where is it — the reason this page exists */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Status
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-sm font-medium ${STAGE_TONE[detail.stage]}`}
              >
                {badgeLabel(detail.stage, detail.status)}
              </span>
              <span className="text-sm text-gray-500">
                {dateLabel(detail)} {shortDate(detail.effective_date)}
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

            {detail.tracking.length > 0 ? (
              <div className="mt-3 space-y-2">
                {detail.tracking.map((t, i) => (
                  <div
                    key={`${t.trackingNum}-${i}`}
                    className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <Truck size={15} className="mt-0.5 shrink-0 text-gray-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span>{t.carrier ?? "Tracking"}</span>
                        <span>·</span>
                        <span>
                          {t.shipped
                            ? `Shipped ${shortDate(t.dateShipped)}`
                            : "Label created"}
                        </span>
                      </div>
                      {t.url ? (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all font-mono text-sm text-brand-700 hover:underline"
                        >
                          {t.trackingNum}
                        </a>
                      ) : (
                        <div className="break-all font-mono text-sm text-gray-900">
                          {t.trackingNum}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-400">
                No tracking number recorded for this order yet.
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
