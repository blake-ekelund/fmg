"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { faireReceived, type FairePayout } from "@/lib/fairePayouts";
import type { FaireJournalEntry } from "@/lib/faireJournal";
import { downloadFaireJournalXlsx } from "@/lib/faireJournalXlsx";
import { authHeader, money, shortDate } from "@/components/accounting/amazonSettlementParts";

/* Faire payouts — the orders Faire paid each day — as journal entries. Select
   payouts, download their entries, and tick them "Entered in QBO" once they're
   in QuickBooks. Data: /api/accounting/faire-payouts (synced hourly from the
   Faire API; Refresh pulls the latest now). */

const API = "/api/accounting/faire-payouts";
const PAGE_SIZE = 25;
const payoutHref = (date: string) => `/accounting/faire-payouts/${date}`;
const JE_LIST = "/accounting/faire-payouts/journal-entries";
const jeHref = (id: string) => `${JE_LIST}/${id}`;

/** Everything Faire nets out of a payout (= net − what it paid in). */
const faireCosts = (p: FairePayout) => p.net - faireReceived(p.columns);

export default function FairePayoutsPage() {
  const router = useRouter();
  const [payouts, setPayouts] = useState<FairePayout[]>([]);
  const [ready, setReady] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"open" | "all">("open");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(API, { headers: await authHeader(), cache: "no-store" });
      const j = (await res.json()) as { ready?: boolean; payouts?: FairePayout[]; lastSyncedAt?: string | null; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load payouts.");
      setReady(j.ready !== false);
      setPayouts(j.payouts ?? []);
      setLastSyncedAt(j.lastSyncedAt ?? null);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Couldn't load payouts."]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setErrors([]);
    try {
      const res = await fetch(`${API}?refresh=1`, { method: "POST", headers: await authHeader() });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't refresh from Faire.");
      await load();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Couldn't refresh from Faire."]);
    } finally {
      setRefreshing(false);
    }
  };

  /** One journal entry for the selected payouts: saves it, downloads its .xlsx, and opens it. */
  const createJournalEntry = async () => {
    const dates = [...selected];
    setCreating(true);
    setErrors([]);
    try {
      const res = await fetch("/api/accounting/faire-journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ dates }),
      });
      const j = (await res.json().catch(() => ({}))) as { entry?: FaireJournalEntry; error?: string };
      if (!res.ok || !j.entry) throw new Error(j.error ?? "Couldn't create the journal entry.");
      downloadFaireJournalXlsx(j.entry);
      router.push(jeHref(j.entry.id));
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Couldn't create the journal entry."]);
      setCreating(false);
    }
  };

  /** Tick / untick "Entered in QBO"; updates the rows at once and rolls back on failure. */
  const setInQbo = async (dates: string[], entered: boolean) => {
    if (!dates.length) return;
    const before = payouts;
    setPayouts((list) =>
      list.map((p) => (dates.includes(p.date) ? { ...p, qboEnteredAt: entered ? new Date().toISOString() : null, qboEnteredBy: entered ? "You" : null } : p)),
    );
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ dates, entered }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't save that.");
      setSelected(new Set());
    } catch (e) {
      setPayouts(before);
      setErrors([e instanceof Error ? e.message : "Couldn't save that."]);
    } finally {
      setSaving(false);
    }
  };

  const shown = useMemo(() => (view === "open" ? payouts.filter((p) => !p.qboEnteredAt) : payouts), [payouts, view]);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = shown.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const selectedPayouts = payouts.filter((p) => selected.has(p.date));
  const openCount = payouts.filter((p) => !p.qboEnteredAt).length;
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.date));

  const toggle = (date: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-4">
      <PageMeta
        title="Faire Payouts"
        description="What Faire paid each day, as journal entries — select payouts and mark them entered in QuickBooks."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-1 rounded-lg bg-gray-100 p-0.5 text-sm">
          {(["open", "all"] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setPage(0);
              }}
              className={`rounded-md px-3 py-1 font-medium ${view === v ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
            >
              {v === "open" ? `Not in QBO (${openCount})` : `All (${payouts.length})`}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {lastSyncedAt ? `Synced from Faire ${new Date(lastSyncedAt).toLocaleString()}` : "Not synced from Faire yet"}
        </span>
        <Link href={JE_LIST} className={btn}>
          <BookOpen size={14} /> Journal entries
        </Link>
        <button onClick={() => void refresh()} disabled={refreshing || !ready} className={btn} title="Pull the latest paid orders from Faire">
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh from Faire
        </button>
      </div>

      {!ready && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Faire Payouts needs a database update first — run <span className="font-mono">supabase db push</span> (migration
          20261111010000). The first sync then pulls about 13 months of Faire payouts.
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-[#0b2a4a] px-4 py-2.5 text-sm text-white shadow-lg">
          <span className="font-medium">
            {selected.size} payout{selected.size === 1 ? "" : "s"} selected · net $
            {money(selectedPayouts.reduce((s, p) => s + Math.round(p.net * 100), 0) / 100)}
          </span>
          <button
            onClick={() => void createJournalEntry()}
            disabled={creating || selectedPayouts.some((p) => p.journalEntry)}
            title={
              selectedPayouts.some((p) => p.journalEntry)
                ? "Some selected payouts are already in a journal entry"
                : "Save one journal entry for these payouts and download it (.xlsx)"
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-yellow-300 px-3 py-1 font-medium text-[#0b2a4a] hover:bg-yellow-200 disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Create journal entry (.xlsx)
          </button>
          <button
            onClick={() => void setInQbo([...selected], true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-3 py-1 font-medium text-white hover:bg-green-600 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark entered in QBO
          </button>
          {selectedPayouts.some((p) => p.qboEnteredAt) && (
            <button onClick={() => void setInQbo([...selected], false)} disabled={saving} className="text-white/80 underline hover:text-white">
              Mark not entered
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/70 hover:text-white">
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="bg-[#0b2a4a] text-white">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  className="h-4 w-4 accent-yellow-300"
                  checked={allVisibleSelected}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      for (const p of visible) {
                        if (allVisibleSelected) next.delete(p.date);
                        else next.add(p.date);
                      }
                      return next;
                    })
                  }
                />
              </th>
              {["Payout", "Orders", "Units", "Sales", "Shipping Reimb.", "Received", "Faire Costs", "Net Payout", "QuickBooks"].map((h, i) => (
                <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${i >= 1 && i <= 7 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-gray-500">
                  {!ready
                    ? "Waiting for the database update."
                    : payouts.length === 0
                      ? "No payouts yet — click Refresh from Faire."
                      : "Every payout is entered in QBO."}
                </td>
              </tr>
            ) : (
              visible.map((p, idx) => (
                <tr
                  key={p.date}
                  className={`border-t border-gray-200 cursor-pointer hover:bg-yellow-50 ${selected.has(p.date) ? "bg-yellow-50" : idx % 2 ? "bg-gray-50/60" : ""}`}
                  onClick={() => router.push(payoutHref(p.date))}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.date}`}
                      className="h-4 w-4 accent-[#0b2a4a]"
                      checked={selected.has(p.date)}
                      onChange={() => toggle(p.date)}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">
                    <Link href={payoutHref(p.date)} onClick={(e) => e.stopPropagation()} className="text-[#0b2a4a] hover:underline">
                      {shortDate(p.date)}
                    </Link>
                    <div className="max-w-[260px] truncate text-xs font-normal text-gray-500">
                      {[...new Set(p.orders.map((o) => o.retailer))].join(", ")}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{p.orders.length}</td>
                  <td className="px-3 py-2 text-right">{p.units.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">$ {money(p.columns.grossSales)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700">$ {money(p.columns.shippingReimbursed)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-medium">$ {money(faireReceived(p.columns))}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700">$ {money(faireCosts(p))}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">$ {money(p.net)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
                    {p.journalEntry && (
                      <Link href={jeHref(p.journalEntry.id)} className="mr-2 font-mono text-[11px] text-[#0b2a4a] hover:underline">
                        {p.journalEntry.number}
                      </Link>
                    )}
                    {p.qboEnteredAt ? (
                      <button
                        onClick={() => void setInQbo([p.date], false)}
                        title={`Entered by ${p.qboEnteredBy ?? "someone"} on ${shortDate(p.qboEnteredAt.slice(0, 10))} — click to undo`}
                        className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline"
                      >
                        <CheckCircle2 size={12} /> Entered in QBO
                      </button>
                    ) : (
                      <button
                        onClick={() => void setInQbo([p.date], true)}
                        disabled={!ready}
                        className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-200 disabled:opacity-50"
                      >
                        Mark entered
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {shown.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min(shown.length, (safePage + 1) * PAGE_SIZE)} of {shown.length}
          </span>
          <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className={btn} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1} className={btn} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
