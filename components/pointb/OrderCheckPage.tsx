"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Boxes,
  Warehouse,
  ArrowLeftRight,
  Play,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Order Check — founder-facing reconciliation. "Run" pulls the recent orders per
 * status and shows how each sits in both systems (Fishbowl + Point B / Synapse);
 * clicking a row (or searching a SO#) drills into the full side-by-side detail.
 * Read-only; data from /api/pointb/reconcile-batch and /order-check.
 */

/* ── Single-order detail types ─────────────────────────────────────────── */
type Result = {
  so: string;
  fishbowl: {
    num: string;
    customerPO: string;
    status: string;
    channel: string;
    total: number;
    shipTo: string;
    saleLines: number;
    saleQty: number;
    shippingLines: number[];
    tracking: string[];
  };
  synapse: {
    orderid: number;
    orderType: string;
    status: string;
    fromFacility: string | null;
    carrier: string | null;
    dateShipped: string | null;
    shippingCost: number | null;
    shipTo: string;
    qtyShip: number | null;
    lines: number;
  } | null;
  fees: { totalAmount: number; detail: Array<{ code: number; description: string; amount: number }> } | null;
  alignment: {
    foundInBoth: boolean;
    freightMatch: boolean;
    expectedFreightLine: number | null;
    synapseTracking: (string | null)[];
    trackingMatch: boolean;
    qtyMatch: boolean;
  };
  connected: { fishbowl: boolean; synapse: boolean; fees: boolean };
  pointbError: string | null;
};

/* ── Batch types ───────────────────────────────────────────────────────── */
type BatchState = "aligned" | "review" | "pending";
type BatchRow = {
  num: string;
  channel: string;
  fbTracking: string[];
  fbShipLines: number[];
  synapse: { status: string; tracking: string[]; shippingCost: number | null; dateShipped: string | null } | null;
  state: BatchState;
};
type BatchGroup = { status: string; orders: BatchRow[]; aligned: number; total: number };
type BatchResult = {
  groups: BatchGroup[];
  connected: { fishbowl: boolean; synapse: boolean };
  pointbError: string | null;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Parse a response body safely — never throws on an empty/non-JSON body. */
async function readJson(r: Response): Promise<Record<string, unknown>> {
  const text = await r.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
      ) : (
        <XCircle size={16} className="text-gray-300 shrink-0" />
      )}
      <span className={ok ? "text-gray-800" : "text-gray-500"}>{children}</span>
    </div>
  );
}

function StateBadge({ state, connected }: { state: BatchState; connected: boolean }) {
  if (!connected) return <span className="text-xs text-gray-400">—</span>;
  const map: Record<BatchState, { cls: string; label: string }> = {
    aligned: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Aligned" },
    review: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Review" },
    pending: { cls: "bg-gray-100 text-gray-500 ring-gray-200", label: "Awaiting ship" },
  };
  const s = map[state];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value || "—"}</span>
    </div>
  );
}

export default function OrderCheckPage() {
  const [so, setSo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Load the batch on first open so the founder sees data immediately.
  useEffect(() => {
    runBatch();
  }, []);

  async function runBatch() {
    setBatchLoading(true);
    setBatchError(null);
    try {
      const r = await fetch("/api/pointb/reconcile-batch", { headers: await authHeader() });
      const json = await readJson(r);
      if (!r.ok) setBatchError((json.error as string) ?? `Failed (${r.status})`);
      else setBatch(json as unknown as BatchResult);
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchLoading(false);
    }
  }

  async function doCheck(value: string) {
    const v = value.trim();
    if (!v) return;
    setSo(v);
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch(`/api/pointb/order-check?so=${encodeURIComponent(v)}`, {
        headers: await authHeader(),
      });
      const json = await readJson(r);
      if (!r.ok) setError((json.error as string) ?? `Failed (${r.status})`);
      else setRes(json as unknown as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doCheck(so);
  }

  const a = res?.alignment;
  const allGood = !!a && a.foundInBoth && a.freightMatch && a.trackingMatch;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1000px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
          <ArrowLeftRight size={14} />
          Order Check
        </div>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight mt-1">Fishbowl ↔ Point B</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Confirm our books (Fishbowl) and the warehouse (Point B) agree. Run the reconciliation for a
          quick pass across recent orders, or click any order for the full side-by-side.
        </p>
      </div>

      {/* Batch reconciliation */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Reconciliation</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              The most recent orders in each status, checked against Point B. Click a row for detail.
            </p>
          </div>
          <button
            onClick={runBatch}
            disabled={batchLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {batchLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Run
          </button>
        </div>

        {batchError && (
          <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {batchError}
          </div>
        )}

        {batch && (
          <div className="mt-4 space-y-5">
            {!batch.connected.synapse && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Point B isn&apos;t connected in this environment yet — showing Fishbowl orders only.
                {batch.pointbError && <span className="block text-gray-400 mt-0.5">({batch.pointbError})</span>}
              </div>
            )}
            {batch.groups.map((g) => (
              <div key={g.status}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-gray-900">{g.status}</span>
                  {batch.connected.synapse && (
                    <span className="text-[11px] text-gray-500">
                      {g.aligned}/{g.total} aligned
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Order</th>
                        <th className="text-left font-medium px-3 py-2">Channel</th>
                        <th className="text-left font-medium px-3 py-2">Fishbowl tracking</th>
                        <th className="text-left font-medium px-3 py-2">Point B tracking</th>
                        <th className="text-left font-medium px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {g.orders.map((o) => (
                        <tr
                          key={o.num}
                          onClick={() => doCheck(o.num)}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-3 py-2 font-medium text-gray-900">{o.num}</td>
                          <td className="px-3 py-2 text-gray-600">{o.channel || "—"}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                            {o.fbTracking.join(", ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                            {o.synapse ? o.synapse.tracking.join(", ") || "shipped" : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <StateBadge state={o.state} connected={batch.connected.synapse} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {batch.groups.length === 0 && (
              <div className="text-sm text-gray-400 py-4 text-center">No recent issued orders.</div>
            )}
          </div>
        )}
      </div>

      {/* Single-order lookup */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Check a single order</h2>
        <form onSubmit={onSubmit} className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={so}
              onChange={(e) => setSo(e.target.value)}
              placeholder="Order number (e.g. 24527)"
              className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !so.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Check
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Single-order detail */}
      {res && (
        <div className="space-y-5">
          {res.connected.synapse ? (
            <div
              className={`rounded-2xl border p-4 ${
                allGood ? "border-emerald-100 bg-emerald-50/70" : "border-amber-100 bg-amber-50/70"
              }`}
            >
              <div className="flex items-center gap-2">
                {allGood ? (
                  <CheckCircle2 size={18} className="text-emerald-600" />
                ) : (
                  <XCircle size={18} className="text-amber-600" />
                )}
                <span className={`text-sm font-semibold ${allGood ? "text-emerald-900" : "text-amber-900"}`}>
                  {allGood
                    ? `Both systems agree on order ${res.fishbowl.num}.`
                    : a?.foundInBoth
                      ? `Order ${res.fishbowl.num} — found in both, review the details.`
                      : `Order ${res.fishbowl.num} hasn't reached Point B yet (or isn't matched).`}
                </span>
              </div>
              {a && a.foundInBoth && (
                <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
                  <Check ok={a.foundInBoth}>In both systems</Check>
                  <Check ok={a.trackingMatch}>Tracking matches</Check>
                  <Check ok={a.freightMatch}>Shipping charge matches</Check>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              The Point B connection isn&apos;t set up yet — showing the Fishbowl side only.
              {res.pointbError && <span className="block text-xs text-gray-400 mt-1">({res.pointbError})</span>}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <Boxes size={15} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Fishbowl</h2>
                <span className="text-[11px] text-gray-400 ml-auto">our books</span>
              </div>
              <Row label="Order #" value={res.fishbowl.num} />
              <Row label="Customer PO" value={res.fishbowl.customerPO} />
              <Row label="Status" value={res.fishbowl.status} />
              <Row label="Channel" value={res.fishbowl.channel} />
              <Row label="Ship to" value={res.fishbowl.shipTo} />
              <Row label="Product lines / units" value={`${res.fishbowl.saleLines} / ${res.fishbowl.saleQty}`} />
              <Row
                label="Shipping line(s)"
                value={res.fishbowl.shippingLines.map((v) => money(v)).join(" + ") || "none yet"}
              />
              <Row label="Tracking" value={res.fishbowl.tracking.join(", ") || "none yet"} />
              <Row label="Order total" value={money(res.fishbowl.total)} />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <Warehouse size={15} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Point B (Synapse)</h2>
                <span className="text-[11px] text-gray-400 ml-auto">the warehouse</span>
              </div>
              {res.synapse ? (
                <>
                  <Row label="Warehouse order #" value={res.synapse.orderid} />
                  <Row label="Type" value={res.synapse.orderType} />
                  <Row label="Status" value={res.synapse.status} />
                  <Row label="Ship to" value={res.synapse.shipTo} />
                  <Row label="Units shipped" value={res.synapse.qtyShip} />
                  <Row label="Carrier" value={res.synapse.carrier} />
                  <Row label="Tracking" value={a?.synapseTracking.filter(Boolean).join(", ") || "none yet"} />
                  <Row label="Freight (raw)" value={money(res.synapse.shippingCost)} />
                  <Row label="Date shipped" value={res.synapse.dateShipped} />
                </>
              ) : (
                <div className="text-sm text-gray-400 py-6 text-center">
                  Not found in Point B{res.connected.synapse ? " — may not have shipped yet." : "."}
                </div>
              )}
            </div>
          </div>

          {res.fees && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">How the shipping charge is built</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  {res.fees.detail.map((d) => (
                    <div key={d.code} className="flex justify-between text-xs text-gray-600">
                      <span>{d.description}</span>
                      <span>{money(d.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-medium text-gray-900 pt-1 border-t border-gray-100">
                    <span>Point B total</span>
                    <span>{money(res.fees.totalAmount)}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 flex flex-col justify-center">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Point B total × 1.25 (25% markup)</span>
                    <span className="font-medium text-gray-900">{money(a?.expectedFreightLine ?? null)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Fishbowl shipping line</span>
                    <span className="font-medium text-gray-900">
                      {res.fishbowl.shippingLines.map((v) => money(v)).join(" + ") || "—"}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Check ok={!!a?.freightMatch}>{a?.freightMatch ? "Matches" : "Does not match"}</Check>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
