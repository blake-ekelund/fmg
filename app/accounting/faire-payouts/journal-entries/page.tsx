"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import type { FaireJournalEntry } from "@/lib/faireJournal";
import { authHeader, money, shortDate } from "@/components/accounting/amazonSettlementParts";

/* Every Faire journal entry made on Faire Payouts (select payouts → Create
   journal entry), newest first — the record of what went to QuickBooks. */

const jeHref = (id: string) => `/accounting/faire-payouts/journal-entries/${id}`;

export default function FaireJournalEntriesPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<FaireJournalEntry[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/accounting/faire-journal-entries", { headers: await authHeader(), cache: "no-store" });
        const j = (await res.json()) as { ready?: boolean; entries?: FaireJournalEntry[]; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Couldn't load journal entries.");
        setReady(j.ready !== false);
        setEntries(j.entries ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load journal entries.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-4">
      <PageMeta title="Faire Journal Entries" description="Every journal entry made from Faire payouts — what went to QuickBooks, and when." />

      <Link href="/accounting/faire-payouts" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft size={14} /> Faire Payouts
      </Link>

      {!ready && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Journal entries need a database update first — run <span className="font-mono">supabase db push</span> (migration
          20261111020000).
        </div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="bg-[#0b2a4a] text-white">
              {["Entry", "Date", "Memo", "Payouts", "Net Deposit", "Created", "QuickBooks"].map((h, i) => (
                <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${i === 3 || i === 4 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin" />
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-500">
                  No journal entries yet — on <Link href="/accounting/faire-payouts" className="font-medium underline">Faire Payouts</Link>,
                  select payouts and click <span className="font-medium">Create journal entry</span>.
                </td>
              </tr>
            ) : (
              entries.map((e, idx) => (
                <tr
                  key={e.id}
                  onClick={() => router.push(jeHref(e.id))}
                  className={`border-t border-gray-200 cursor-pointer hover:bg-yellow-50 ${idx % 2 ? "bg-gray-50/60" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={jeHref(e.id)} onClick={(ev) => ev.stopPropagation()} className="font-mono font-medium text-[#0b2a4a] hover:underline">
                      {e.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{shortDate(e.date)}</td>
                  <td className="px-3 py-2 text-gray-700">{e.memo}</td>
                  <td className="px-3 py-2 text-right">{e.payoutDates.length}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">$ {money(e.net)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                    {[e.createdBy, shortDate(e.createdAt.slice(0, 10))].filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {e.qboEnteredAt ? (
                      <span className="inline-flex items-center gap-1 font-medium text-green-700" title={`By ${e.qboEnteredBy ?? "someone"}`}>
                        <CheckCircle2 size={12} /> Entered in QBO
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">Not entered</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
