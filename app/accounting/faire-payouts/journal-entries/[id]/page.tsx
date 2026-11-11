"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { jeTotals, type FaireJournalEntry } from "@/lib/faireJournal";
import { FAIRE_JE_COLUMNS, FAIRE_JE_LABELS } from "@/lib/fairePayouts";
import { downloadFaireJournalXlsx } from "@/lib/faireJournalXlsx";
import { authHeader, money, shortDate } from "@/components/accounting/amazonSettlementParts";

/* One Faire journal entry — the documentation of what was booked: header,
   debit/credit lines, the payouts it covers and every order behind them (as
   they were when the entry was made). Downloads as .xlsx; tick it once it's
   in QuickBooks. */

const API = "/api/accounting/faire-journal-entries";

export default function FaireJournalEntryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [je, setJe] = useState<FaireJournalEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"qbo" | "delete" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, { headers: await authHeader(), cache: "no-store" });
      const j = (await res.json()) as { entry?: FaireJournalEntry; error?: string };
      if (!res.ok || !j.entry) throw new Error(j.error ?? "Couldn't load this entry.");
      setJe(j.entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this entry.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setInQbo = async (entered: boolean) => {
    setBusy("qbo");
    setError(null);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ id, entered }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't save that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!je || !window.confirm(`Delete ${je.number}? Its payouts can then go into another entry.${je.qboEnteredAt ? "\n\nIt's marked entered in QBO — delete it there too if it's wrong." : ""}`))
      return;
    setBusy("delete");
    const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: await authHeader() });
    if (!res.ok) {
      setBusy(null);
      return setError("Couldn't delete it.");
    }
    router.push("/accounting/faire-payouts/journal-entries");
  };

  const totals = je ? jeTotals(je.lines) : null;
  const btn =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none";
  const th = "px-2.5 py-1.5 font-semibold whitespace-nowrap";

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-5">
      <PageMeta title={je ? `${je.number} · Faire` : "Faire Journal Entry"} description="A Faire journal entry: lines, payouts and orders." />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/accounting/faire-payouts/journal-entries" className="mr-auto inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={14} /> Faire Journal Entries
        </Link>
        {je && (
          <>
            <button onClick={() => downloadFaireJournalXlsx(je)} className={btn}>
              <FileSpreadsheet size={14} /> Download .xlsx
            </button>
            {je.qboEnteredAt ? (
              <button onClick={() => void setInQbo(false)} disabled={busy !== null} className={`${btn} text-green-700`} title="Click to undo">
                {busy === "qbo" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Entered in QBO
              </button>
            ) : (
              <button
                onClick={() => void setInQbo(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2a4a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#123a63] disabled:opacity-60"
              >
                {busy === "qbo" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark entered in QBO
              </button>
            )}
            <button onClick={() => void remove()} disabled={busy !== null} className={`${btn} hover:text-red-700`}>
              {busy === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
            </button>
          </>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!je || !totals ? (
        !error && (
          <div className="py-16 text-center text-gray-400">
            <Loader2 size={18} className="inline animate-spin" />
          </div>
        )
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <h2 className="font-mono text-lg font-semibold text-gray-900">{je.number}</h2>
              <span className="text-sm text-gray-600">Date {shortDate(je.date)}</span>
              <span className="text-sm text-gray-600">
                Net deposit <span className="font-medium text-gray-900">${money(je.net)}</span>
              </span>
            </div>
            <div className="text-sm text-gray-700">{je.memo}</div>
            <div className="text-xs text-gray-500">
              Created {shortDate(je.createdAt.slice(0, 10))}
              {je.createdBy ? ` by ${je.createdBy}` : ""} ·{" "}
              {je.qboEnteredAt
                ? `Entered in QBO by ${je.qboEnteredBy ?? "someone"} on ${shortDate(je.qboEnteredAt.slice(0, 10))}`
                : "Not entered in QBO yet"}
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Journal entry</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="bg-[#0b2a4a] text-white text-xs">
                    <th className={`${th} text-left`}>Account</th>
                    <th className={`${th} text-left`}>Description</th>
                    <th className={`${th} text-right`}>Debit</th>
                    <th className={`${th} text-right`}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {je.lines.map((l) => (
                    <tr key={l.key} className="border-t border-gray-100">
                      <td className="px-2.5 py-1.5">
                        {l.account.number && <span className="mr-2 font-mono text-xs text-gray-500">{l.account.number}</span>}
                        <span className={l.account.number ? "text-gray-900" : "font-medium text-amber-700"}>{l.account.name}</span>
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-600">{l.description}</td>
                      <td className="px-2.5 py-1.5 text-right">{l.debit ? money(l.debit) : ""}</td>
                      <td className="px-2.5 py-1.5 text-right">{l.credit ? money(l.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-300">
                  <tr className="bg-yellow-100 font-semibold text-gray-900">
                    <td className="px-2.5 py-1.5" colSpan={2}>
                      Total {totals.debit === totals.credit ? "— balanced" : ""}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">{money(totals.debit)}</td>
                    <td className="px-2.5 py-1.5 text-right">{money(totals.credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {je.lines.some((l) => !l.account.number) && (
              <p className="inline-flex items-start gap-1.5 text-xs text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Faire paid differently from its itemised costs on some orders (adjustments it doesn&apos;t break out) — choose the account for
                that line when you enter it.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Detail — {je.payouts.length} payout{je.payouts.length === 1 ? "" : "s"},{" "}
              {je.payouts.reduce((s, p) => s + p.orders.length, 0)} orders
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-[#0b2a4a] text-white">
                    <th className={`${th} text-left`}>Payout</th>
                    <th className={`${th} text-left`}>Order</th>
                    <th className={`${th} text-left`}>Retailer</th>
                    {FAIRE_JE_COLUMNS.map((c) => (
                      <th key={c} className={`${th} text-right`}>
                        {FAIRE_JE_LABELS[c]}
                      </th>
                    ))}
                    <th className={`${th} text-right`}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {je.payouts.flatMap((p) =>
                    p.orders.map((o, i) => (
                      <tr key={o.displayId} className={`border-t ${i === 0 ? "border-gray-300" : "border-gray-100"}`}>
                        <td className="px-2.5 py-1 whitespace-nowrap">
                          {i === 0 ? (
                            <Link href={`/accounting/faire-payouts/${p.date}`} className="text-[#0b2a4a] hover:underline">
                              {shortDate(p.date)}
                            </Link>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="px-2.5 py-1 font-mono whitespace-nowrap">{o.displayId}</td>
                        <td className="px-2.5 py-1 text-gray-700">{o.retailer}</td>
                        {FAIRE_JE_COLUMNS.map((c) => (
                          <td key={c} className="px-2.5 py-1 text-right whitespace-nowrap">
                            {o.columns[c] === 0 ? <span className="text-gray-300">–</span> : money(o.columns[c])}
                          </td>
                        ))}
                        <td className="px-2.5 py-1 text-right whitespace-nowrap font-semibold">{money(o.net)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
                <tfoot className="border-t-2 border-gray-300">
                  <tr className="bg-yellow-100 font-semibold text-gray-900">
                    <td className="px-2.5 py-1.5" colSpan={3}>
                      Total
                    </td>
                    {FAIRE_JE_COLUMNS.map((c) => (
                      <td key={c} className="px-2.5 py-1.5 text-right whitespace-nowrap">
                        {money(je.columns[c])}
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{money(je.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
