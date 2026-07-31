"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gift,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AddPrebookingModal from "./AddPrebookingModal";
import {
  aggregateTotals,
  estimatedTotal,
  money,
  prebookInvoiceLines,
  PREBOOK_STATUSES,
  statusMeta,
  type PrebookRequest,
  type PrebookStatus,
} from "@/lib/storefrontPrebooking";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const PAGE_SIZE = 25;

function StoreBadge({ store }: { store: string }) {
  const ni = store === "ni";
  return (
    <span
      className={
        ni
          ? "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
          : "inline-flex rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700"
      }
    >
      {ni ? "NI" : "Sassy"}
    </span>
  );
}

/**
 * Holiday prebook requests from the storefronts — what each buyer reserved and
 * who they are. Reads `holiday_prebook_requests` via /api/storefront-prebookings
 * (service role); shows an honest empty state until the table exists. Filtering
 * + pagination are client-side (the API returns the latest 500).
 */
export default function PrebookingsPage() {
  const [rows, setRows] = useState<PrebookRequest[]>([]);
  const [notReady, setNotReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState<"all" | "sassy" | "ni">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PrebookStatus>("all");
  const [page, setPage] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/storefront-prebookings", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setError(null);
      setNotReady(!!json.notReady);
      setRows(json.prebookings as PrebookRequest[]);
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

  async function updateStatus(id: string, status: PrebookStatus) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    setSavingId(id);
    try {
      const res = await fetch(`/api/storefront-prebookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? "Couldn't update status.");
        setRows(prev); // roll back
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows(prev);
    } finally {
      setSavingId(null);
    }
  }

  // Search + store filter (but NOT the status tab, so tab counts stay meaningful).
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (storeFilter !== "all" && (r.store ?? "") !== storeFilter) return false;
      if (q) {
        const hay = [r.business_name, r.contact_name, r.email, r.phone].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, storeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length };
    for (const r of base) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [base]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? base : base.filter((r) => r.status === statusFilter)),
    [base, statusFilter],
  );

  const totals = useMemo(() => aggregateTotals(filtered), [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

  const STATUS_TABS: { key: "all" | PrebookStatus; label: string }[] = [
    { key: "all", label: "All" },
    ...PREBOOK_STATUSES.map((s) => ({ key: s.key, label: s.label })),
  ];

  const totalTiles = [
    { label: "Requests", value: String(filtered.length) },
    { label: "HC case packs", value: String(totals.cases) },
    // Gift sets sell as case packs of 4 — show both so nobody misreads
    // "6 cases" as six individual $14 sets.
    { label: "GS case packs", value: `${totals.giftSets}`, detail: `${totals.giftSetUnits} sets` },
    { label: "Lip packs", value: String(totals.lipPacks) },
    { label: "HC displays", value: String(totals.hcDisplays) },
    { label: "Lip displays", value: String(totals.lipDisplays) },
    { label: "Est. total", value: money(totals.estimated) },
  ];

  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          Holiday prebook requests from the storefronts — what each buyer reserved for the season and how to reach them.
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-gray-800"
        >
          <Plus size={14} /> Add prebooking
        </button>
      </div>

      <AddPrebookingModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(row) => {
          setRows((rs) => [row, ...rs]);
          setNotReady(false);
          setShowAdd(false);
        }}
      />

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading prebookings…
        </div>
      ) : notReady ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <Gift size={24} className="mx-auto text-gray-300" />
          <h2 className="mt-3 text-sm font-medium text-gray-900">No prebook table yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            The <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">holiday_prebook_requests</code> table isn&apos;t
            set up yet. Once it exists, requests appear here automatically.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          No prebook requests yet. They&apos;ll show up here the moment the first one lands.
        </div>
      ) : (
        <>
          {/* Totals across the current filter */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {totalTiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <div className="text-lg font-bold tabular-nums text-gray-900">
                  {t.value}
                  {"detail" in t && t.detail && (
                    <span className="ml-1 text-[11px] font-medium text-gray-400">({t.detail})</span>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                placeholder="Search buyer, email, phone"
                className="w-72 rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {STATUS_TABS.map((t) => {
                const active = statusFilter === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { setStatusFilter(t.key); setPage(0); }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      active ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t.label}
                    <span className={active ? "ml-1 text-gray-300" : "ml-1 text-gray-400"}>{counts[t.key] ?? 0}</span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={storeFilter}
                onChange={(e) => { setStoreFilter(e.target.value as typeof storeFilter); setPage(0); }}
                className={selectCls}
              >
                <option value="all">Both stores</option>
                <option value="sassy">Sassy</option>
                <option value="ni">NI</option>
              </select>
            </div>
          </div>

          {/* Table — buyer-first summary; expand a row to see what was prebooked. */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Business</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Requested</th>
                  <th className="px-3 py-2.5 font-medium">Store</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-400">
                      No prebookings match these filters.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((r) => {
                    const open = expanded.has(r.id);
                    const invoice = prebookInvoiceLines(r);
                    return (
                      <Fragment key={r.id}>
                        <tr
                          onClick={() => toggleExpand(r.id)}
                          className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                        >
                          <td className="px-3 py-2.5 text-gray-400">
                            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">{r.business_name || "—"}</td>
                          <td className="px-3 py-2.5 text-gray-600">{r.contact_name || "—"}</td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {r.email ? (
                              <a href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()} className="hover:text-gray-900 hover:underline">
                                {r.email}
                              </a>
                            ) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">{r.phone || "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">
                            {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2.5"><StoreBadge store={r.store} /></td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                            {money(estimatedTotal(r))}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1.5">
                              <select
                                value={r.status}
                                onChange={(e) => updateStatus(r.id, e.target.value as PrebookStatus)}
                                disabled={savingId === r.id}
                                aria-label="Status"
                                className={`cursor-pointer rounded-full border-0 py-1 pl-2.5 pr-6 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 ${statusMeta(r.status).badge}`}
                              >
                                {PREBOOK_STATUSES.map((s) => (
                                  <option key={s.key} value={s.key} className="bg-white text-gray-700">{s.label}</option>
                                ))}
                              </select>
                              {savingId === r.id ? <Loader2 size={12} className="animate-spin text-gray-400" /> : null}
                            </div>
                          </td>
                        </tr>

                        {open ? (
                          <tr className="border-b border-gray-100 bg-gray-50/60">
                            <td />
                            <td colSpan={8} className="px-3 pb-4 pt-1">
                              {invoice.length === 0 ? (
                                <span className="text-[11px] text-gray-400">No items on this request.</span>
                              ) : (
                                <div className="max-w-xl">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400">
                                        <th className="py-1 pr-3 font-medium">Item</th>
                                        <th className="py-1 px-3 text-right font-medium">Qty</th>
                                        <th className="py-1 px-3 text-right font-medium">Unit</th>
                                        <th className="py-1 pl-3 text-right font-medium">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {invoice.map((l, i) => (
                                        <tr key={i} className="border-t border-gray-100">
                                          <td className="py-1.5 pr-3 text-gray-700">{l.description}</td>
                                          <td className="py-1.5 px-3 text-right tabular-nums text-gray-600">{l.qty}</td>
                                          <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{money(l.unitPrice)}</td>
                                          <td className="py-1.5 pl-3 text-right tabular-nums font-medium text-gray-900">{money(l.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-gray-200">
                                        <td colSpan={3} className="py-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                          Estimated total
                                        </td>
                                        <td className="py-1.5 pl-3 text-right tabular-nums font-bold text-gray-900">
                                          {money(estimatedTotal(r))}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                  <p className="mt-1.5 text-[10px] text-gray-400">Estimate only — no payment taken on a prebook.</p>
                                  {r.notes ? <div className="mt-2 text-[11px] italic text-gray-500">“{r.notes}”</div> : null}
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{filtered.length === 0 ? "No prebookings" : `Showing ${from}–${to} of ${filtered.length}`}</span>
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
                <span className="px-1">Page {safePage + 1} of {pageCount}</span>
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
