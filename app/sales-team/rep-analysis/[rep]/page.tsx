"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { authHeader } from "@/components/sales-team/repShared";

/**
 * Current-YTD vs prior-YTD analysis for one rep group, formatted to print or
 * PDF and send to the agency principal. Data comes from
 * /api/sales-team/rep-analysis (agency-scoped bridge + product + customer
 * breakdowns + actions).
 */

type Named = { productnum?: string; customerid?: string; name?: string; description?: string; cur: number; prior: number; delta?: number };
type Analysis = {
  rep: string;
  window: { label: string; curYear: number; priorYear: number };
  kpis: { cur: number; prior: number; variance: number; variance_pct: number; customers: number; buyers_cur: number; buyers_prior: number };
  bridge: { cur: number; prior: number; delta: number; parts: { key: string; label: string; amount: number }[]; newCount: number; lostCount: number };
  products: { growing: Named[]; declining: Named[]; new: Named[]; lost: Named[] };
  customers: { growing: Named[]; declining: Named[]; new: Named[]; lapsed: Named[] };
  actions: string[];
};

const usd = (n: number) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (n >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function RepAnalysisPage() {
  const params = useParams<{ rep: string }>();
  const rep = decodeURIComponent(String(params?.rep ?? ""));
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rep) return;
    (async () => {
      try {
        const res = await fetch(`/api/sales-team/rep-analysis?rep=${encodeURIComponent(rep)}`, {
          headers: await authHeader(),
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
        setData(json as Analysis);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [rep]);

  if (error) {
    return (
      <div className="p-6 md:px-8">
        <BackLink />
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6 md:px-8">
        <BackLink />
        <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  const { kpis, bridge, window: win } = data;
  const up = kpis.variance >= 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:px-8 print:max-w-none print:p-0">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <BackLink />
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{data.rep}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Performance review · {win.curYear} vs {win.priorYear} year-to-date (Jan 1 – {win.label})
        </p>
      </div>

      {/* 1. Summary + bridge */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label={`${win.curYear} YTD`} value={usd(kpis.cur)} />
          <Kpi label={`${win.priorYear} YTD`} value={usd(kpis.prior)} />
          <Kpi
            label="Variance"
            value={signed(kpis.variance)}
            sub={`${kpis.variance_pct >= 0 ? "+" : ""}${kpis.variance_pct.toFixed(1)}%`}
            tone={up ? "good" : "bad"}
          />
          <Kpi label="Buyers" value={`${kpis.buyers_cur} / ${kpis.customers}`} sub={`${kpis.buyers_prior} last YTD`} />
        </div>

        {/* Bridge */}
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          What moved the {usd(bridge.delta)} change
        </h3>
        <div className="mt-2 space-y-1.5">
          {bridge.parts.map((p) => {
            const pos = p.amount >= 0;
            const pct = Math.min(100, (Math.abs(p.amount) / Math.max(1, Math.abs(bridge.delta) || bridge.prior)) * 100);
            return (
              <div key={p.key} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-gray-600">{p.label}</span>
                <div className="relative h-4 min-w-0 flex-1 rounded bg-gray-50">
                  <div
                    className={`absolute top-0 h-full rounded ${pos ? "left-1/2 bg-emerald-500" : "right-1/2 bg-rose-500"}`}
                    style={{ width: `${pct / 2}%` }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-gray-300" />
                </div>
                <span className={`w-24 shrink-0 text-right tabular-nums ${pos ? "text-emerald-700" : "text-rose-700"}`}>
                  {signed(p.amount)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Volume, mix and price cover continuing products; new and lost cover products gained or dropped since last year. The five sum to the total change.
        </p>
      </section>

      {/* 2. Product analysis */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Products</h2>
        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <MoverTable title="Growing" rows={data.products.growing} kind="delta" nameKey="description" />
          <MoverTable title="Declining" rows={data.products.declining} kind="delta" nameKey="description" />
          <MoverTable title="New this year" rows={data.products.new} kind="cur" nameKey="description" />
          <MoverTable title="Dropped (sold last year, not this)" rows={data.products.lost} kind="prior" nameKey="description" />
        </div>
      </section>

      {/* 3. Customer analysis */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Customers</h2>
        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <MoverTable title="Growing" rows={data.customers.growing} kind="delta" nameKey="name" />
          <MoverTable title="Declining" rows={data.customers.declining} kind="delta" nameKey="name" />
          <MoverTable title="New this year" rows={data.customers.new} kind="cur" nameKey="name" />
          <MoverTable title="Lapsed (bought last year, not this)" rows={data.customers.lapsed} kind="prior" nameKey="name" />
        </div>
      </section>

      {/* 4. Actions */}
      {data.actions.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Recommended actions</h2>
          <ol className="mt-3 space-y-2">
            {data.actions.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/sales-team" className="text-sm font-medium text-gray-500 hover:text-gray-900">
      ← Rep directory
    </Link>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2.5">
      <div className="text-xs text-gray-400">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function MoverTable({
  title,
  rows,
  kind,
  nameKey,
}: {
  title: string;
  rows: Named[];
  kind: "delta" | "cur" | "prior";
  nameKey: "name" | "description";
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">None.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((r, i) => {
            const val = kind === "delta" ? (r.delta ?? 0) : kind === "cur" ? r.cur : r.prior;
            const tone = kind === "delta" ? (val >= 0 ? "text-emerald-700" : "text-rose-700") : "text-gray-900";
            return (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 truncate text-gray-700">{r[nameKey] ?? r.productnum ?? r.customerid}</span>
                <span className={`shrink-0 tabular-nums ${tone}`}>
                  {kind === "delta" ? signed(val) : usd(val)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
