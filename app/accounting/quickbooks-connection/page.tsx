"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle, ChevronDown } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { QbConnection, Snippet } from "@/lib/fishbowlQbMap";

/* How Fishbowl talks to QuickBooks Desktop: which accounts it posts to (its
   defaults, plus items that carry their own), and one real example of each
   kind of posting — read live from Fishbowl (lib/fishbowlQbMap.ts). */

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function QuickBooksConnectionPage() {
  const [data, setData] = useState<QbConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllReasons, setShowAllReasons] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/quickbooks-connection${fresh ? "?fresh=1" : ""}`, { headers: await authHeader(), cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Couldn't load (${res.status})`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lastExport = data?.lastExports[0];
  const mappedReasons = data?.adjustReasons.filter((r) => r.expense || r.income) ?? [];
  const unmappedReasons = data?.adjustReasons.filter((r) => !r.expense && !r.income) ?? [];

  /* Activity as month rows × posting-type columns. */
  const activity = useMemo(() => {
    if (!data) return { months: [] as string[], types: [] as string[], cell: new Map<string, { count: number; amount: number }>() };
    const months = [...new Set(data.activity.map((a) => a.month))].sort();
    const order = ["Ship", "Payment", "Adjust", "Customer Change", "Vendor Change"];
    const types = [...new Set(data.activity.map((a) => a.type))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const cell = new Map(data.activity.map((a) => [`${a.month}|${a.type}`, { count: a.count, amount: a.amount }]));
    return { months, types, cell };
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageMeta
        title="QuickBooks Connection"
        description="Which QuickBooks Desktop accounts Fishbowl posts to, and what each kind of transaction looks like when it gets there."
      />

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-gray-900">QuickBooks connection</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            How Fishbowl posts to QuickBooks Desktop{data?.company ? ` (${data.company})` : ""}: which accounts it uses, and what each kind of
            transaction looks like when it lands. Read live from Fishbowl.
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={clsx(loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          <Loader2 size={15} className="animate-spin" /> Reading Fishbowl…
        </div>
      ) : data ? (
        <>
          {/* Status */}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
              {lastExport?.ok ? <CheckCircle2 size={15} className="text-green-600" /> : <AlertTriangle size={15} className="text-amber-600" />}
              QuickBooks <b>Desktop</b> · last export {when(lastExport?.at ?? null)}
              {lastExport && !lastExport.ok && <span className="text-amber-700">(with errors)</span>}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-600">
              {data.qboConnected ? <CheckCircle2 size={15} className="text-green-600" /> : <XCircle size={15} className="text-gray-400" />}
              QuickBooks <b>Online</b>: {data.qboConnected ? "connected" : "not connected"}
            </span>
            <span className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-600">
              Exports nightly at 6:00 PM
            </span>
          </div>

          {/* Alerts */}
          {data.alerts.length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((a) => (
                <div key={a.title} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <div className="text-sm font-semibold text-amber-900">{a.title}</div>
                    <div className="text-sm text-amber-900/80">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Snippets */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">What each transaction looks like in QuickBooks</h2>
            <p className="text-sm text-gray-500">
              The most recent real example of each kind of posting. Purchase orders, receipts and vendor bills are not sent — those are
              entered in QuickBooks by hand.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {data.snippets.map((s, i) => (
                <SnippetCard key={`${s.type}-${i}`} s={s} />
              ))}
            </div>
          </section>

          {/* Default accounts */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Default accounts</h2>
            <p className="text-sm text-gray-500">Used for everything unless an item has its own account (next section).</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-2.5 font-medium">Used for</th>
                    <th className="px-4 py-2.5 font-medium">QuickBooks account</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.defaults.map((d) => (
                    <tr key={d.key}>
                      <td className="px-4 py-2 text-gray-700">{d.purpose}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {d.account ? (
                          <>
                            {d.account.number && <span className="mr-1.5 tabular-nums text-gray-500">{d.account.number}</span>}
                            {d.account.name}
                          </>
                        ) : (
                          <span className="font-normal text-gray-400">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{d.account?.type ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Overrides */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Items with their own accounts</h2>
            <p className="text-sm text-gray-500">These parts and products post to a different account than the default.</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-2.5 font-medium">Posts to</th>
                    <th className="px-4 py-2.5 font-medium">Instead of the default…</th>
                    <th className="px-4 py-2.5 text-right font-medium">Items</th>
                    <th className="px-4 py-2.5 font-medium">For example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.overrides.map((o) => (
                    <tr key={`${o.field}-${o.account?.id ?? "x"}`}>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {o.account ? (
                          <>
                            {o.account.number && <span className="mr-1.5 tabular-nums text-gray-500">{o.account.number}</span>}
                            {o.account.name}
                            <div className="text-xs font-normal text-gray-400">{o.account.type}</div>
                          </>
                        ) : (
                          "Unknown account"
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{o.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                        {o.items}
                        {o.active !== o.items && <div className="text-xs text-gray-400">{o.active} active</div>}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{o.examples.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Discount & adjustment reasons */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Discount &amp; adjustment reasons</h2>
            <p className="text-sm text-gray-500">
              Discount lines on invoices post to these. {unmappedReasons.length} reason{unmappedReasons.length === 1 ? " has" : "s have"} no
              account of its own and use the default discount accounts.
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-2.5 font-medium">Reason</th>
                    <th className="px-4 py-2.5 font-medium">Expense (debit)</th>
                    <th className="px-4 py-2.5 font-medium">Income (credit)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(showAllReasons ? [...mappedReasons, ...unmappedReasons] : mappedReasons).map((r) => (
                    <tr key={r.reason}>
                      <td className="px-4 py-2 font-medium text-gray-900">{r.reason}</td>
                      <td className="px-4 py-2 text-gray-700">{r.expense ?? <span className="text-gray-400">default</span>}</td>
                      <td className="px-4 py-2 text-gray-700">{r.income ?? <span className="text-gray-400">default</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unmappedReasons.length > 0 && (
              <button onClick={() => setShowAllReasons((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
                <ChevronDown size={14} className={clsx("transition-transform", showAllReasons && "rotate-180")} />
                {showAllReasons ? "Hide the ones using the defaults" : `Show the ${unmappedReasons.length} using the defaults`}
              </button>
            )}
          </section>

          {/* Activity */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">What&rsquo;s been posted in 2026</h2>
            <p className="text-sm text-gray-500">Count per month; Ship shows the cost of goods posted, Adjust the adjustment value.</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-2.5 font-medium">Month</th>
                    {activity.types.map((t) => (
                      <th key={t} className="px-4 py-2.5 text-right font-medium">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activity.months.map((m) => (
                    <tr key={m}>
                      <td className="px-4 py-2 text-gray-700">{m}</td>
                      {activity.types.map((t) => {
                        const c = activity.cell.get(`${m}|${t}`);
                        const showAmt = (t === "Ship" || t === "Adjust") && c && c.amount;
                        return (
                          <td key={t} className="px-4 py-2 text-right tabular-nums text-gray-700">
                            {c ? c.count.toLocaleString("en-US") : <span className="text-gray-300">—</span>}
                            {showAmt ? (
                              <div className={clsx("text-xs", c.amount > 100000 ? "font-medium text-amber-700" : "text-gray-400")}>${money(c.amount)}</div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Chart of accounts */}
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">Chart of accounts Fishbowl sees</h2>
            <p className="text-sm text-gray-500">Fishbowl keeps a copy of QuickBooks&rsquo; chart of accounts, refreshed with each export.</p>
            <div className="flex flex-wrap gap-2">
              {data.chart.map((c) => (
                <span key={c.type} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
                  {c.type.replace(/([a-z])([A-Z])/g, "$1 $2")} <b className="tabular-nums">{c.active}</b>
                  {c.total !== c.active && <span className="text-gray-400"> (+{c.total - c.active} inactive)</span>}
                </span>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SnippetCard({ s }: { s: Snippet }) {
  const debits = s.lines.reduce((a, l) => a + l.debit, 0);
  const credits = s.lines.reduce((a, l) => a + l.credit, 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{s.type}</span>
          <span className="text-xs text-gray-400">{day(s.when)}</span>
        </div>
        <div className="mt-1 font-medium text-gray-900">{s.title}</div>
        <div className="mt-0.5 text-sm text-gray-600">{s.summary}</div>
      </div>
      {s.lines.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="px-4 py-2 text-right font-medium">Debit</th>
              <th className="px-4 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-1.5 text-gray-800">{l.account}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 text-xs text-gray-500">
              <td className="px-4 py-1.5">Total</td>
              <td className="px-4 py-1.5 text-right tabular-nums">{money(debits)}</td>
              <td className="px-4 py-1.5 text-right tabular-nums">{money(credits)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {s.note && <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">{s.note}</p>}
    </div>
  );
}
