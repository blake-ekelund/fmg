"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Printer,
  Truck,
  Package,
  Loader2,
  CheckCircle2,
  Clock,
  Ban,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { stageOf, type OrderStage } from "@/lib/orderStage";
import type { Order } from "../../types";
import { formatDate, formatMoney } from "../utils/format";

/* The order drawer: a rendered, printable invoice for one order plus its
   shipping status, read Point B (Synapse) first and Fishbowl as a fallback. */

type FullOrder = {
  id: number | null;
  num: string | null;
  status: string | null;
  dateissued: string | null;
  datecreated: string | null;
  datecompleted: string | null;
  totalprice: number | null;
  channel: string | null;
  customerpo: string | null;
  customercontact: string | null;
  email: string | null;
  phone: string | null;
  billtoname: string | null;
  billtoaddress: string | null;
  billtocity: string | null;
  billtostate: string | null;
  billtozip: string | null;
  shiptoname: string | null;
  shiptoaddress: string | null;
  shiptocity: string | null;
  shiptostate: string | null;
  shiptozip: string | null;
};

type Line = {
  sku: string;
  description: string;
  qty: number;
  lineTotal: number;
};

/** Shape of the bits of /api/pointb/order-check we read. */
type OrderCheck = {
  fishbowl?: { num: string; status: string; channel: string; total: number; shipTo: string; tracking: string[] };
  synapse?: {
    orderid: string;
    status: string;
    carrier: string | null;
    dateShipped: string | null;
    shipTo: string;
    qtyShip: number | null;
  } | null;
  alignment?: { synapseTracking: string[]; trackingMatch: boolean; foundInBoth: boolean };
  connected?: { fishbowl: boolean; synapse: boolean };
  pointbError?: string | null;
  error?: string;
};

const STAGE_META: Record<OrderStage, { label: string; badge: string; icon: typeof Clock }> = {
  estimate: { label: "Estimate", badge: "bg-amber-50 text-amber-700 ring-amber-200", icon: Clock },
  open: { label: "In progress", badge: "bg-sky-50 text-sky-700 ring-sky-200", icon: Package },
  completed: { label: "Shipped", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", badge: "bg-gray-100 text-gray-500 ring-gray-200", icon: Ban },
};

function orderRef(o: { num?: string | null; id: string | number }) {
  return o.num ? String(o.num) : `#${o.id}`;
}

function addressLines(name: string | null, addr: string | null, city: string | null, state: string | null, zip: string | null) {
  const cityLine = [city, state].filter(Boolean).join(", ");
  return [name, addr, [cityLine, zip].filter(Boolean).join(" ")].map((s) => (s ?? "").trim()).filter(Boolean);
}

export default function OrderDrawer({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const open = !!order;
  const [doc, setDoc] = useState<FullOrder | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingDoc, setLoadingDoc] = useState(false);

  const [ship, setShip] = useState<OrderCheck | null>(null);
  const [loadingShip, setLoadingShip] = useState(false);

  const orderId = order?.id ?? null;
  const orderNum = order?.num ?? null;

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Load the full header + line items for the invoice.
  useEffect(() => {
    if (orderId == null) return;
    let cancelled = false;
    setLoadingDoc(true);
    setDoc(null);
    setLines([]);

    (async () => {
      const numericId = Number(orderId);
      const [{ data: head }, { data: items }] = await Promise.all([
        supabase
          .from("sales_orders_raw")
          .select(
            "id,num,status,dateissued,datecreated,datecompleted,totalprice,channel,customerpo,customercontact,email,phone,billtoname,billtoaddress,billtocity,billtostate,billtozip,shiptoname,shiptoaddress,shiptocity,shiptostate,shiptozip",
          )
          .eq("id", numericId)
          .maybeSingle(),
        supabase
          .from("so_items_raw")
          .select("productnum, description, qtyfulfilled, qtyordered, totalprice")
          .eq("soid", numericId)
          .limit(500),
      ]);

      if (cancelled) return;
      setDoc((head as FullOrder) ?? null);
      setLines(
        ((items as { productnum: string | null; description: string | null; qtyfulfilled: number | null; qtyordered: number | null; totalprice: number | null }[]) ?? []).map((i) => ({
          sku: i.productnum ?? "—",
          description: i.description ?? "—",
          qty: i.qtyfulfilled ?? i.qtyordered ?? 0,
          lineTotal: i.totalprice ?? 0,
        })),
      );
      setLoadingDoc(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Load shipping status (Point B first, Fishbowl fallback) — only with a SO#.
  useEffect(() => {
    if (!orderNum) {
      setShip(null);
      return;
    }
    let cancelled = false;
    setLoadingShip(true);
    setShip(null);

    (async () => {
      try {
        // Internal API routes authenticate via the Bearer access token, not a
        // cookie — attach the current session token or the call 401s.
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(`/api/pointb/order-check?so=${encodeURIComponent(orderNum)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = (await res.json().catch(() => ({}))) as OrderCheck;
        if (!cancelled) setShip(json);
      } catch (e) {
        if (!cancelled) setShip({ error: e instanceof Error ? e.message : "Couldn't reach shipping status." });
      } finally {
        if (!cancelled) setLoadingShip(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderNum]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.lineTotal, 0), [lines]);

  if (!order) return null;

  const fbStatus = ship?.fishbowl?.status ?? doc?.status ?? order.status ?? null;
  const stage = STAGE_META[stageOf(fbStatus)];
  const synapse = ship?.synapse ?? null;
  const pointbTracking = ship?.alignment?.synapseTracking ?? [];
  const fbTracking = ship?.fishbowl?.tracking ?? [];
  const pointbConnected = ship?.connected?.synapse ?? false;

  const billTo = doc
    ? addressLines(doc.billtoname, doc.billtoaddress, doc.billtocity, doc.billtostate, doc.billtozip)
    : [];
  const shipTo = doc
    ? addressLines(doc.shiptoname, doc.shiptoaddress, doc.shiptocity, doc.shiptostate, doc.shiptozip)
    : [];

  function printInvoice() {
    if (!doc) return;
    const rows = lines
      .map(
        (l) =>
          `<tr><td>${esc(l.sku)}</td><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${money(l.lineTotal)}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(orderRef({ num: doc.num, id: order!.id }))}</title>
      <style>
        *{box-sizing:border-box} body{font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:40px}
        h1{font-size:20px;margin:0 0 2px} .muted{color:#666} .r{text-align:right}
        .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
        .addr{display:flex;gap:48px;margin:24px 0}
        .addr h3{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:0 0 6px}
        table{width:100%;border-collapse:collapse;margin-top:12px} th,td{padding:8px 6px;border-bottom:1px solid #eee;text-align:left}
        th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#888} tfoot td{border:0;font-weight:600}
      </style></head><body>
      <div class="head">
        <div><h1>Fragrance Marketing Group</h1><div class="muted">Invoice</div></div>
        <div class="r"><div><strong>Order ${esc(orderRef({ num: doc.num, id: order!.id }))}</strong></div>
          ${doc.customerpo ? `<div class="muted">PO ${esc(doc.customerpo)}</div>` : ""}
          <div class="muted">Placed ${esc(formatDate(doc.dateissued ?? doc.datecreated))}</div>
          ${doc.datecompleted ? `<div class="muted">Completed ${esc(formatDate(doc.datecompleted))}</div>` : ""}
        </div>
      </div>
      <div class="addr">
        <div><h3>Bill to</h3>${billTo.map((l) => `<div>${esc(l)}</div>`).join("") || '<div class="muted">—</div>'}</div>
        <div><h3>Ship to</h3>${shipTo.map((l) => `<div>${esc(l)}</div>`).join("") || '<div class="muted">—</div>'}</div>
      </div>
      <table><thead><tr><th>SKU</th><th>Description</th><th class="r">Qty</th><th class="r">Line total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="muted">No line items.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="3" class="r">Order total</td><td class="r">${money(doc.totalprice ?? order!.totalprice)}</td></tr></tfoot>
      </table>
      </body></html>`;
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  const StageIcon = stage.icon;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-[1px]"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={`Order ${orderRef(order)}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-mono text-base font-semibold text-gray-900">{orderRef(order)}</h2>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${stage.badge}`}>
                    <StageIcon size={11} />
                    {stage.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {order.channel} · {formatMoney(doc?.totalprice ?? order.totalprice)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={printInvoice}
                  disabled={!doc}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* ── Shipping status ── */}
              <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <Truck size={13} /> Shipping status
                </div>

                {loadingShip ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                    <Loader2 size={13} className="animate-spin" /> Checking Point B &amp; Fishbowl…
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Point B first */}
                    {synapse ? (
                      <StatusCard
                        source="Point B · Synapse"
                        primary={synapse.dateShipped ? `Shipped ${formatDate(synapse.dateShipped)}` : synapse.status}
                        shipped={!!synapse.dateShipped}
                        rows={[
                          ["Status", synapse.status],
                          ["Carrier", synapse.carrier || "—"],
                          synapse.qtyShip != null ? ["Qty shipped", String(synapse.qtyShip)] : null,
                        ]}
                        tracking={pointbTracking}
                      />
                    ) : pointbConnected ? (
                      <p className="text-xs text-gray-400">
                        Point B has no matching order for this SO{ship?.pointbError ? ` (${ship.pointbError})` : ""}.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Point B isn&apos;t connected — showing Fishbowl status only.</p>
                    )}

                    {/* Fishbowl fallback / corroboration */}
                    <StatusCard
                      source="Fishbowl"
                      primary={stage.label}
                      shipped={stageOf(fbStatus) === "completed"}
                      rows={[["Status", fbStatus || "—"]]}
                      tracking={fbTracking}
                    />

                    {synapse && fbTracking.length > 0 && pointbTracking.length > 0 && !ship?.alignment?.trackingMatch && (
                      <p className="text-[11px] text-amber-700">
                        Heads up: Point B and Fishbowl tracking numbers don&apos;t match.
                      </p>
                    )}
                    {ship?.error && (
                      <p className="text-[11px] text-gray-400">Couldn&apos;t load Point B: {ship.error}</p>
                    )}
                  </div>
                )}
              </section>

              {/* ── Invoice ── */}
              <section className="rounded-xl border border-gray-200 p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Invoice</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      Order {orderRef(order)}
                      {doc?.customerpo ? ` · PO ${doc.customerpo}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <div>Placed {formatDate(doc?.dateissued ?? doc?.datecreated ?? order.dateissued ?? null)}</div>
                    {(doc?.datecompleted ?? order.datecompleted) && (
                      <div>Completed {formatDate(doc?.datecompleted ?? order.datecompleted)}</div>
                    )}
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-4">
                  <AddressBlock label="Bill to" lines={billTo} />
                  <AddressBlock label="Ship to" lines={shipTo} />
                </div>

                {loadingDoc ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-gray-400">
                    <Loader2 size={13} className="animate-spin" /> Loading invoice…
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/70 text-left text-[10px] uppercase tracking-wider text-gray-400">
                          <th className="px-3 py-2 font-medium">SKU</th>
                          <th className="px-3 py-2 font-medium">Description</th>
                          <th className="px-3 py-2 text-right font-medium">Qty</th>
                          <th className="px-3 py-2 text-right font-medium">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={`${l.sku}-${i}`} className="border-b border-gray-50 last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-900">{l.sku}</td>
                            <td className="px-3 py-2 text-gray-500">{l.description}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.qty}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">{formatMoney(l.lineTotal)}</td>
                          </tr>
                        ))}
                        {lines.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                              No line items found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        {lines.length > 0 && Math.abs(subtotal - (doc?.totalprice ?? order.totalprice)) > 0.01 && (
                          <tr className="border-t border-gray-100">
                            <td colSpan={3} className="px-3 py-1.5 text-right text-gray-400">Line items</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{formatMoney(subtotal)}</td>
                          </tr>
                        )}
                        <tr className="border-t border-gray-200">
                          <td colSpan={3} className="px-3 py-2.5 text-right font-medium text-gray-700">Order total</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                            {formatMoney(doc?.totalprice ?? order.totalprice)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function StatusCard({
  source,
  primary,
  shipped,
  rows,
  tracking,
}: {
  source: string;
  primary: string;
  shipped: boolean;
  rows: ([string, string] | null)[];
  tracking: string[];
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{source}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            shipped ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"
          }`}
        >
          {shipped ? <CheckCircle2 size={11} /> : <Clock size={11} />}
          {primary}
        </span>
      </div>
      <dl className="mt-2 space-y-1">
        {rows.filter(Boolean).map((r) => {
          const [k, v] = r as [string, string];
          return (
            <div key={k} className="flex justify-between gap-3 text-xs">
              <dt className="text-gray-400">{k}</dt>
              <dd className="text-right text-gray-700">{v}</dd>
            </div>
          );
        })}
      </dl>
      {tracking.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tracking</div>
          <div className="mt-1 space-y-0.5">
            {tracking.map((t) => (
              <a
                key={t}
                href={`https://www.google.com/search?q=${encodeURIComponent(t)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-700"
              >
                {t}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddressBlock({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      {lines.length ? (
        <div className="mt-1 space-y-0.5 text-xs text-gray-700">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : (
        <div className="mt-1 text-xs text-gray-300">—</div>
      )}
    </div>
  );
}

/* ── tiny helpers for the printed invoice ── */
function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function money(v: number | null | undefined): string {
  return formatMoney(typeof v === "number" ? v : 0);
}
