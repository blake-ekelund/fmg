"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2 } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { FAIRE_JE_COLUMNS, FAIRE_JE_LABELS, payoutBySku, payoutsCsvRows, type FairePayout } from "@/lib/fairePayouts";
import { authHeader, downloadFile, money, shortDate } from "@/components/accounting/amazonSettlementParts";

/* One Faire payout (the orders Faire paid on one day): its journal entry, the
   orders behind it (retailer, sales, commission, fees, shipping), and what sold
   by SKU. Tick "Entered in QBO" once the entry is in QuickBooks. */

const API = "/api/accounting/faire-payouts";

export default function FairePayoutPage() {
  const { date } = useParams<{ date: string }>();
  const [p, setP] = useState<FairePayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}?date=${encodeURIComponent(date)}`, { headers: await authHeader(), cache: "no-store" });
      const j = (await res.json()) as { payout?: FairePayout; error?: string };
      if (!res.ok || !j.payout) throw new Error(j.error ?? "Couldn't load this payout.");
      setP(j.payout);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this payout.");
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const setInQbo = async (entered: boolean) => {
    if (!p) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ dates: [p.date], entered }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't save that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const skus = useMemo(() => (p ? payoutBySku(p) : []), [p]);
  const damaged = p ? p.orders.reduce((s, o) => s + o.damagedReported, 0) : 0;

  const downloadOrders = () => {
    if (!p) return;
    downloadFile(`faire-payout-${p.date}-orders.csv`, [
      ["Order", "Retailer", "Paid", ...FAIRE_JE_COLUMNS.map((c) => FAIRE_JE_LABELS[c]), "Net"],
      ...p.orders.map((o) => [
        o.displayId,
        o.retailer,
        o.paidAt,
        ...FAIRE_JE_COLUMNS.map((c) => o.columns[c].toFixed(2)),
        o.net.toFixed(2),
      ]),
      ["Total", "", "", ...FAIRE_JE_COLUMNS.map((c) => p.columns[c].toFixed(2)), p.net.toFixed(2)],
    ]);
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none";
  const th = "px-2.5 py-1.5 font-semibold whitespace-nowrap";

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-5">
      <PageMeta
        title={p ? `Faire Payout · ${shortDate(p.date)}` : "Faire Payout"}
        description="One Faire payout's journal entry, the orders behind it, and what sold."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/accounting/faire-payouts" className="mr-auto inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={14} /> Faire Payouts
        </Link>
        {p && (
          <>
            <button onClick={() => downloadFile(`faire-journal-entry-${p.date}.csv`, payoutsCsvRows([p]))} className={btn}>
              <Download size={14} /> Journal entry
            </button>
            <button onClick={downloadOrders} className={btn}>
              <Download size={14} /> Orders
            </button>
            {p.qboEnteredAt ? (
              <button onClick={() => void setInQbo(false)} disabled={saving} className={`${btn} text-green-700`} title="Click to undo">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Entered in QBO
              </button>
            ) : (
              <button
                onClick={() => void setInQbo(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2a4a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#123a63] disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark entered in QBO
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!p ? (
        !error && (
          <div className="py-16 text-center text-gray-400">
            <Loader2 size={18} className="inline animate-spin" />
          </div>
        )
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <h2 className="text-lg font-semibold text-gray-900">Paid {shortDate(p.date)}</h2>
              <span className="text-sm text-gray-600">
                Net payout <span className="font-medium text-gray-900">${money(p.net)}</span>
              </span>
              <span className="text-sm text-gray-600">
                {p.orders.length} order{p.orders.length === 1 ? "" : "s"} · {p.units.toLocaleString()} units
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {p.qboEnteredAt
                ? `Entered in QBO by ${p.qboEnteredBy ?? "someone"} on ${shortDate(p.qboEnteredAt.slice(0, 10))}`
                : "Not entered in QBO yet"}
              {" · "}A payout is every order Faire paid that day (Central time); check it against the deposit and the Faire portal.
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Journal entry</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-[#0b2a4a] text-white">
                    {[...FAIRE_JE_COLUMNS.map((c) => FAIRE_JE_LABELS[c]), "Net Payout"].map((h) => (
                      <th key={h} className={`${th} text-right`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-yellow-100 font-medium text-gray-900">
                    {FAIRE_JE_COLUMNS.map((c) => (
                      <td key={c} className="px-2.5 py-1.5 text-right whitespace-nowrap">
                        {money(p.columns[c])}
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap font-semibold">{money(p.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(Math.abs(p.columns.other) >= 0.005 || damaged > 0) && (
              <p className="inline-flex items-start gap-1.5 text-xs text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  {Math.abs(p.columns.other) >= 0.005 &&
                    `Other ${money(p.columns.other)} is what Faire paid differently from the itemised costs (adjustments Faire doesn't break out). `}
                  {damaged > 0 &&
                    `Faire reported $${money(damaged)} of damaged/missing items — shown for information; it isn't deducted from this payout.`}
                </span>
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Orders</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-[#0b2a4a] text-white">
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
                  {p.orders.map((o, i) => (
                    <tr key={o.displayId} className={`border-t border-gray-100 ${i % 2 ? "bg-gray-50/60" : ""}`}>
                      <td className="px-2.5 py-1 font-mono whitespace-nowrap">{o.displayId}</td>
                      <td className="px-2.5 py-1 text-gray-700">{o.retailer}</td>
                      {FAIRE_JE_COLUMNS.map((c) => (
                        <td key={c} className="px-2.5 py-1 text-right whitespace-nowrap text-gray-800">
                          {o.columns[c] === 0 ? <span className="text-gray-300">–</span> : money(o.columns[c])}
                        </td>
                      ))}
                      <td className="px-2.5 py-1 text-right whitespace-nowrap font-semibold">{money(o.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-300">
                  <tr className="bg-yellow-100 font-semibold text-gray-900">
                    <td className="px-2.5 py-1.5" colSpan={2}>
                      Payout total
                    </td>
                    {FAIRE_JE_COLUMNS.map((c) => (
                      <td key={c} className="px-2.5 py-1.5 text-right whitespace-nowrap">
                        {money(p.columns[c])}
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{money(p.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Products sold</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-[#0b2a4a] text-white">
                    <th className={`${th} text-left`}>SKU</th>
                    <th className={`${th} text-left`}>Product</th>
                    <th className={`${th} text-right`}>Qty</th>
                    <th className={`${th} text-right`}>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((r, i) => (
                    <tr key={`${r.sku}-${r.tester}`} className={`border-t border-gray-100 ${i % 2 ? "bg-gray-50/60" : ""}`}>
                      <td className="px-2.5 py-1 font-medium whitespace-nowrap">{r.sku || "—"}</td>
                      <td className="px-2.5 py-1 text-gray-700">
                        {r.product}
                        {r.tester && <span className="ml-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-600">tester</span>}
                      </td>
                      <td className="px-2.5 py-1 text-right">{r.quantity}</td>
                      <td className="px-2.5 py-1 text-right">{money(r.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
