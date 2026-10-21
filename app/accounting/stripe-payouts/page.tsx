"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, FlaskConical, Loader2, RefreshCw } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { PayoutLine, PayoutPage, PayoutSummary } from "@/lib/stripePayoutTypes";
import { EXAMPLE_PAYOUTS } from "@/lib/stripePayoutsExample";

/* Each Stripe payout is one bank deposit and one journal entry. Fishbowl has
   already put every order into QuickBooks as an invoice, so the entry clears
   those invoices: the expanded row lists which orders the deposit paid, plus
   the fees and refunds that explain why the deposit is less than the sales. */

const money = (n: number) => {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
};
const mdY = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y}`;
};

const SUMMARY_HEADERS = ["Deposit date", "Payments", "Refunds", "Stripe Fees", "Other", "Net Deposit", "Orders"];
const LINE_HEADERS = ["Date", "Type", "Order #", "Customer", "Fishbowl #", "Fishbowl customer", "Amount", "Fee", "Net"];

const lineValues = (l: PayoutLine) => [
  mdY(l.date),
  l.kind === "payment" ? "Payment" : l.kind === "refund" ? "Refund" : l.kind === "fee" ? "Stripe fee" : l.type,
  l.order?.number ?? l.orderRef ?? "",
  l.order?.customer ?? "",
  l.order?.fishbowlNum ?? "",
  l.order?.fishbowlCustomer ?? "",
  l.amount.toFixed(2),
  l.fee.toFixed(2),
  l.net.toFixed(2),
];

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function StripePayoutsPage() {
  const [example, setExample] = useState(false);
  const [live, setLive] = useState<PayoutPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Stripe pages by cursor: cursors[i] = the `after` id that loads page i.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIdx, setPageIdx] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (after: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/stripe-payouts${after ? `?after=${after}` : ""}`, {
        headers: await authHeader(),
        cache: "no-store",
      });
      const j = (await res.json()) as PayoutPage & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load payouts.");
      setLive(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load payouts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!example) void load(cursors[pageIdx]);
  }, [example, pageIdx, cursors, load]);

  const payouts: PayoutSummary[] = example ? EXAMPLE_PAYOUTS : (live?.payouts ?? []);
  const hasMore = !example && !!live?.hasMore;

  const older = () => {
    const last = payouts[payouts.length - 1];
    if (!last) return;
    setCursors((c) => [...c.slice(0, pageIdx + 1), last.id]);
    setPageIdx((i) => i + 1);
  };

  const copy = async (key: string, rows: string[][]) => {
    await navigator.clipboard.writeText(rows.map((r) => r.join("\t")).join("\n"));
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const summaryValues = (p: PayoutSummary) => [
    mdY(p.arrivalDate),
    p.payments.toFixed(2),
    p.refunds.toFixed(2),
    p.fees.toFixed(2),
    p.other.toFixed(2),
    p.net.toFixed(2),
    String(p.lines.filter((l) => l.kind === "payment").length),
  ];

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-white ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto space-y-4">
      <PageMeta
        title="Stripe Payouts"
        description="Every Stripe deposit, broken into the orders it paid, refunds and fees — the journal entry for each deposit."
      />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-500 mr-auto">
          Pulled live from Stripe. One row per deposit to the bank; click a row to see the orders it paid.
        </p>
        <button
          onClick={() => {
            setExample((x) => !x);
            setOpen(null);
          }}
          className={`${btn} ${example ? "!bg-amber-100 !ring-amber-300 text-amber-900" : ""}`}
        >
          <FlaskConical size={14} /> {example ? "Showing example" : "Show example"}
        </button>
        <button onClick={() => void load(cursors[pageIdx])} disabled={example || loading} className={btn}>
          <RefreshCw size={14} className={loading && !example ? "animate-spin" : ""} /> Refresh
        </button>
        <button
          onClick={() => void copy("all", [SUMMARY_HEADERS, ...payouts.map(summaryValues)])}
          disabled={!payouts.length}
          className={btn}
        >
          <Copy size={14} /> {copied === "all" ? "Copied" : "Copy for Excel"}
        </button>
      </div>

      {example && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Example data</span> — made-up payouts and orders showing how this page works. Turn off{" "}
          <span className="font-medium">Showing example</span> to see your real Stripe payouts.
        </div>
      )}
      {!example && live && !live.configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Stripe isn&apos;t connected (STRIPE_SECRET_KEY is not set on the server).
        </div>
      )}
      {!example && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="bg-[#0b2a4a] text-white">
              {SUMMARY_HEADERS.map((h, i) => (
                <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !example ? (
              <tr>
                <td colSpan={SUMMARY_HEADERS.length} className="px-3 py-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin" />
                </td>
              </tr>
            ) : payouts.length === 0 ? (
              <tr>
                <td colSpan={SUMMARY_HEADERS.length} className="px-3 py-10 text-center text-sm text-gray-500">
                  No Stripe payouts yet. Click <span className="font-medium">Show example</span> to see how this page works.
                </td>
              </tr>
            ) : (
              payouts.map((p, idx) => {
                const expanded = open === p.id;
                const paymentCount = p.lines.filter((l) => l.kind === "payment").length;
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={`border-t border-gray-200 cursor-pointer hover:bg-yellow-50 ${idx % 2 ? "bg-gray-50/60" : ""}`}
                      onClick={() => setOpen(expanded ? null : p.id)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap font-medium">
                        <span className="inline-flex items-center gap-1">
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {mdY(p.arrivalDate)}
                          {p.status !== "paid" && <span className="ml-1 text-xs font-normal text-gray-500">({p.status.replace("_", " ")})</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">$ {money(p.payments)}</td>
                      <td className="px-3 py-2 text-right">$ {money(p.refunds)}</td>
                      <td className="px-3 py-2 text-right">$ {money(p.fees)}</td>
                      <td className="px-3 py-2 text-right">$ {money(p.other)}</td>
                      <td className="px-3 py-2 text-right font-semibold">$ {money(p.net)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {paymentCount}
                        {p.unmatched > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-amber-700" title="Payments not matched to an order">
                            <AlertTriangle size={12} /> {p.unmatched}
                          </span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={SUMMARY_HEADERS.length} className="px-4 py-4">
                          <PayoutDetail p={p} copied={copied === p.id} onCopy={() => void copy(p.id, [LINE_HEADERS, ...p.lines.map(lineValues)])} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!example && (pageIdx > 0 || hasMore) && (
        <div className="flex items-center justify-end gap-2 text-sm text-gray-600">
          <span>Page {pageIdx + 1}</span>
          <button onClick={() => setPageIdx((i) => i - 1)} disabled={pageIdx === 0 || loading} className={btn} aria-label="Newer payouts">
            <ChevronLeft size={14} />
          </button>
          <button onClick={older} disabled={!hasMore || loading} className={btn} aria-label="Older payouts">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function PayoutDetail({ p, copied, onCopy }: { p: PayoutSummary; copied: boolean; onCopy: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {p.reconciles ? (
          <span className="inline-flex items-center gap-1.5 text-green-700">
            <CheckCircle2 size={14} /> Lines add up to the ${money(p.net)} deposit
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-red-700">
            <AlertTriangle size={14} /> Lines don&apos;t add up to the ${money(p.net)} deposit — check in Stripe
          </span>
        )}
        {p.unmatched > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <AlertTriangle size={14} /> {p.unmatched} payment{p.unmatched === 1 ? "" : "s"} not matched to an order
          </span>
        )}
        <span className="text-gray-500">Payout {p.id}</span>
        <button onClick={onCopy} className="ml-auto inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
          <Copy size={13} /> {copied ? "Copied" : "Copy lines"}
        </button>
      </div>

      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-gray-500">
            {LINE_HEADERS.map((h, i) => (
              <th key={h} className={`py-1 pr-4 font-medium ${i >= 6 ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => {
            const v = lineValues(l);
            const unmatched = (l.kind === "payment" || l.kind === "refund") && !l.order;
            return (
              <tr key={l.id} className={`border-t border-gray-200 ${unmatched ? "bg-amber-50" : ""}`}>
                <td className="py-1 pr-4 whitespace-nowrap">{v[0]}</td>
                <td className="py-1 pr-4 whitespace-nowrap">{v[1]}</td>
                <td className="py-1 pr-4 whitespace-nowrap">
                  {v[2] || (unmatched ? <span className="text-amber-700">No order — {l.description || "unknown"}</span> : "")}
                </td>
                <td className="py-1 pr-4">{v[3]}</td>
                <td className="py-1 pr-4 whitespace-nowrap">{v[4]}</td>
                <td className="py-1 pr-4">{v[5]}</td>
                <td className="py-1 pr-4 text-right">{money(l.amount)}</td>
                <td className="py-1 pr-4 text-right">{money(l.fee)}</td>
                <td className="py-1 text-right font-medium">{money(l.net)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-gray-300 font-semibold">
            <td colSpan={6} className="py-1.5 pr-4">
              Deposit
            </td>
            <td className="py-1.5 pr-4 text-right">{money(p.payments + p.refunds + p.other)}</td>
            <td className="py-1.5 pr-4 text-right">{money(p.fees)}</td>
            <td className="py-1.5 text-right">{money(p.net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
