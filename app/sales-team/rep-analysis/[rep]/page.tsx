"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { authHeader } from "@/components/sales-team/repShared";
import { computeBridge, type ProductAgg, type SalesBridge } from "@/lib/salesBridge";

/** The five bridge amounts as a flat object. */
type Parts = { volume: number; mix: number; price: number; new: number; lost: number };
function parts5(b: SalesBridge): Parts {
  const g = (k: string) => b.parts.find((p) => p.key === k)?.amount ?? 0;
  return { volume: g("volume"), mix: g("mix"), price: g("price"), new: g("new"), lost: g("lost") };
}
const PART_COLS: { key: keyof Parts; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "mix", label: "Mix" },
  { key: "price", label: "Price" },
  { key: "new", label: "New" },
  { key: "lost", label: "Lost" },
];

/**
 * Current-YTD vs prior-YTD analysis for one rep group, formatted to print or
 * PDF and send to the agency principal: a vertical waterfall from prior-year to
 * current-year revenue, product breakdowns by collection & title (with new /
 * dropped SKUs), and a paginated customer variance list.
 */

type Product = {
  productnum: string;
  label: string;
  collection: string;
  title: string;
  cur: number;
  prior: number;
  delta: number;
  curUnits: number;
  priorUnits: number;
  isNew: boolean;
  isDropped: boolean;
};
type Cust = { customerid: string; name: string; cur: number; prior: number; delta: number; parts: Parts; isNew: boolean; isLost: boolean };

type Analysis = {
  rep: string;
  window: { label: string; curYear: number; priorYear: number };
  kpis: { cur: number; prior: number; variance: number; variance_pct: number; customers: number; buyers_cur: number; buyers_prior: number };
  bridge: { cur: number; prior: number; delta: number; parts: { key: string; label: string; amount: number }[]; newCount: number; lostCount: number };
  products: Product[];
  customers: Cust[];
  actions: string[];
};

const usd = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
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

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{data.rep}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Performance review · {win.curYear} vs {win.priorYear} year-to-date (Jan 1 – {win.label})
        </p>
      </div>

      {/* 1. Summary + waterfall */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label={`${win.priorYear} YTD`} value={usd(kpis.prior)} />
          <Kpi label={`${win.curYear} YTD`} value={usd(kpis.cur)} />
          <Kpi
            label="Variance"
            value={signed(kpis.variance)}
            sub={`${kpis.variance_pct >= 0 ? "+" : ""}${kpis.variance_pct.toFixed(1)}%`}
            tone={up ? "good" : "bad"}
          />
          <Kpi label="Buyers" value={`${kpis.buyers_cur} / ${kpis.customers}`} sub={`${kpis.buyers_prior} last YTD`} />
        </div>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {win.priorYear} → {win.curYear} YTD bridge
        </h3>
        <Waterfall bridge={bridge} priorYear={win.priorYear} curYear={win.curYear} />
      </section>

      {/* 2. Products — one filterable, sortable list */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Products</h2>
        <ProductExplorer products={data.products} priorYear={win.priorYear} curYear={win.curYear} />
      </section>

      {/* 3. Customers — paginated variance list */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Customers</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          {data.customers.length} accounts with activity · biggest movers first
        </p>
        <CustomerTable rows={data.customers} priorYear={win.priorYear} curYear={win.curYear} />
      </section>

      {/* 4. Actions */}
      {data.actions?.length > 0 && (
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

/* ── Waterfall (vertical, floating bars) ──────────────────────────────────── */

function Waterfall({
  bridge,
  priorYear,
  curYear,
}: {
  bridge: Analysis["bridge"];
  priorYear: number;
  curYear: number;
}) {
  const H = 240; // chart body height in px

  // Steps: prior total, each delta part, current total.
  const steps: { label: string; kind: "total" | "delta"; value: number }[] = [
    { label: `${priorYear} YTD`, kind: "total", value: bridge.prior },
    ...bridge.parts.map((p) => ({ label: p.label, kind: "delta" as const, value: p.amount })),
    { label: `${curYear} YTD`, kind: "total", value: bridge.cur },
  ];

  // Geometry: each bar spans [base, top] in dollars.
  let running = 0;
  const bars = steps.map((s, i) => {
    if (s.kind === "total") {
      running = s.value;
      return { ...s, base: 0, top: s.value };
    }
    const before = i === 0 ? 0 : running;
    const after = before + s.value;
    running = after;
    return { ...s, base: Math.min(before, after), top: Math.max(before, after) };
  });

  const maxTop = Math.max(...bars.map((b) => b.top), 1) * 1.08;
  const scale = H / maxTop;

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="flex min-w-[520px] items-end gap-2" style={{ height: H + 44 }}>
        {bars.map((b, i) => {
          const barH = Math.max((b.top - b.base) * scale, 2);
          const bottom = b.base * scale;
          const pos = b.kind === "total" || b.value >= 0;
          const color =
            b.kind === "total" ? "bg-brand-700" : b.value >= 0 ? "bg-emerald-500" : "bg-rose-500";
          const valueText = b.kind === "total" ? usd(b.value) : signed(b.value);
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="relative w-full" style={{ height: H }}>
                <div
                  className={`absolute inset-x-2 rounded-sm ${color}`}
                  style={{ bottom, height: barH }}
                />
                <div
                  className={`absolute inset-x-0 text-center text-[10px] font-medium tabular-nums ${
                    pos ? "text-gray-700" : "text-rose-700"
                  }`}
                  style={{ bottom: bottom + barH + 2 }}
                >
                  {valueText}
                </div>
              </div>
              <div className="mt-1 text-center text-[10px] leading-tight text-gray-500">{b.label}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Volume, mix and price cover continuing products; new and lost cover products gained or dropped since last year. The five bridge to the {curYear} total.
      </p>
    </div>
  );
}

/* ── Products: one filterable, sortable, paginated list ───────────────────── */

type GroupBy = "collection" | "title" | "sku";
type StatusFilter = "all" | "growing" | "declining" | "new" | "dropped";
type SortKey = "name" | "prior" | "cur" | "delta" | keyof Parts;

type Row = { name: string; cur: number; prior: number; delta: number; parts: Parts; isNew: boolean; isDropped: boolean };

/** Small red/green number for a bridge component. */
function PartCell({ v }: { v: number }) {
  if (Math.round(v) === 0) return <td className="px-2.5 py-2 text-right tabular-nums text-gray-300">·</td>;
  return (
    <td className={`px-2.5 py-2 text-right tabular-nums ${v >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{signed(v)}</td>
  );
}

function ProductExplorer({ products, priorYear, curYear }: { products: Product[]; priorYear: number; curYear: number }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("collection");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // biggest declines first
  const [page, setPage] = useState(0);
  const PAGE = 12;

  // Roll the flat SKU list up to the chosen grain, and decompose each group's
  // change into the volume/mix/price/new/lost bridge over its own SKUs.
  const rows = useMemo<Row[]>(() => {
    const groups = new Map<string, Product[]>();
    for (const p of products) {
      const gk = groupBy === "sku" ? p.productnum : groupBy === "collection" ? p.collection : p.title;
      const arr = groups.get(gk) ?? [];
      arr.push(p);
      groups.set(gk, arr);
    }
    return [...groups.entries()].map(([gk, ps]) => {
      const curM = new Map<string, ProductAgg>();
      const priorM = new Map<string, ProductAgg>();
      let cur = 0;
      let prior = 0;
      for (const p of ps) {
        cur += p.cur;
        prior += p.prior;
        curM.set(p.productnum, { revenue: p.cur, units: p.curUnits });
        priorM.set(p.productnum, { revenue: p.prior, units: p.priorUnits });
      }
      return {
        name: groupBy === "sku" ? ps[0].label : gk,
        cur,
        prior,
        delta: cur - prior,
        parts: parts5(computeBridge(curM, priorM)),
        isNew: prior === 0 && cur > 0,
        isDropped: cur === 0 && prior > 0,
      };
    });
  }, [products, groupBy]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (term && !r.name.toLowerCase().includes(term)) return false;
      if (status === "growing") return r.delta > 0;
      if (status === "declining") return r.delta < 0;
      if (status === "new") return r.isNew;
      if (status === "dropped") return r.isDropped;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: Row) =>
      sortKey === "name" || sortKey === "prior" || sortKey === "cur" || sortKey === "delta"
        ? sortKey === "name" ? 0 : r[sortKey]
        : r.parts[sortKey];
    out.sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : val(a) - val(b);
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp * dir;
    });
    return out;
  }, [rows, q, status, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const clamped = Math.min(page, pages - 1);
  const slice = filtered.slice(clamped * PAGE, clamped * PAGE + PAGE);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
    setPage(0);
  }

  const seg = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"}`;

  return (
    <div className="mt-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(["collection", "title", "sku"] as GroupBy[]).map((g) => (
            <button key={g} onClick={() => { setGroupBy(g); setPage(0); }} className={seg(groupBy === g)}>
              {g === "collection" ? "Collection" : g === "title" ? "Product" : "SKU"}
            </button>
          ))}
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(0); }}
          aria-label="Filter products"
          className="rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        >
          <option value="all">All</option>
          <option value="growing">Growing</option>
          <option value="declining">Declining</option>
          <option value="new">New this year</option>
          <option value="dropped">Dropped</option>
        </select>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }}
          placeholder="Search…"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 sm:flex-none sm:w-48"
        />
        <span className="ml-auto text-xs text-gray-400">{filtered.length} items</span>
      </div>

      {/* Table — the change split into volume/mix/price/new/lost */}
      <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-400">
              <Th label={groupBy === "sku" ? "Product" : groupBy === "collection" ? "Collection" : "Title"} k="name" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label={`${priorYear}`} k="prior" sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <Th label={`${curYear}`} k="cur" sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              {PART_COLS.map((c) => (
                <Th key={c.key} label={c.label} k={c.key} sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              ))}
              <Th label="Δ" k="delta" sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {slice.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-gray-400">No products match.</td></tr>
            ) : (
              slice.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td className="max-w-[220px] truncate px-4 py-2">
                    <span className="text-gray-800">{r.name}</span>
                    {r.isNew && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">New</span>}
                    {r.isDropped && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">Dropped</span>}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-gray-500">{usd(r.prior)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-gray-900">{usd(r.cur)}</td>
                  {PART_COLS.map((c) => (
                    <PartCell key={c.key} v={r.parts[c.key]} />
                  ))}
                  <td className={`px-2.5 py-2 text-right font-medium tabular-nums ${r.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{signed(r.delta)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 print:hidden">
          <span>Page {clamped + 1} of {pages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(clamped - 1)} disabled={clamped === 0} className="rounded-lg border border-gray-200 px-2.5 py-1 font-medium transition hover:bg-gray-50 disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(clamped + 1)} disabled={clamped >= pages - 1} className="rounded-lg border border-gray-200 px-2.5 py-1 font-medium transition hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-400">
        Each row&apos;s change split into volume, mix, price (continuing items), plus revenue from new and lost SKUs. The five sum to Δ.
      </p>
    </div>
  );
}

function Th({ label, k, sortKey, dir, onSort, align = "left" }: { label: string; k: SortKey; sortKey: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`cursor-pointer select-none px-2.5 py-2 font-medium transition hover:text-gray-700 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label}
      {active && <span className="ml-0.5 text-gray-500">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

/* ── Paginated customer variance table ────────────────────────────────────── */

function CustomerTable({ rows, priorYear, curYear }: { rows: Cust[]; priorYear: number; curYear: number }) {
  const PAGE = 15;
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<"all" | "growing" | "declining" | "new" | "lost">("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // biggest declines first

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((c) => {
      if (term && !c.name.toLowerCase().includes(term)) return false;
      if (status === "growing") return c.delta > 0;
      if (status === "declining") return c.delta < 0;
      if (status === "new") return c.isNew;
      if (status === "lost") return c.isLost;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (c: Cust) =>
      sortKey === "prior" || sortKey === "cur" || sortKey === "delta"
        ? c[sortKey]
        : sortKey === "name"
          ? 0
          : c.parts[sortKey];
    out.sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : val(a) - val(b);
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp * dir;
    });
    return out;
  }, [rows, q, status, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const clamped = Math.min(page, pages - 1);
  const slice = filtered.slice(clamped * PAGE, clamped * PAGE + PAGE);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
    setPage(0);
  }

  return (
    <div className="mt-3">
      {/* Controls */}
      <div className="mb-2 flex flex-wrap items-center gap-2 print:hidden">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}
          aria-label="Filter customers"
          className="rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        >
          <option value="all">All</option>
          <option value="growing">Growing</option>
          <option value="declining">Declining</option>
          <option value="new">New this year</option>
          <option value="lost">Lost</option>
        </select>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }}
          placeholder="Search…"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10 sm:flex-none sm:w-48"
        />
        <span className="ml-auto text-xs text-gray-400">{filtered.length} accounts</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-400">
              <Th label="Customer" k="name" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label={`${priorYear}`} k="prior" sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <Th label={`${curYear}`} k="cur" sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              {PART_COLS.map((c) => (
                <Th key={c.key} label={c.label} k={c.key} sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              ))}
              <Th label="Δ" k="delta" sortKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {slice.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-gray-400">No accounts match.</td></tr>
            )}
            {slice.map((c) => (
              <tr key={c.customerid}>
                <td className="max-w-[220px] truncate px-4 py-2">
                  <span className="text-gray-800">{c.name}</span>
                  {c.isNew && (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">New</span>
                  )}
                  {c.isLost && (
                    <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">Lost</span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums text-gray-500">{usd(c.prior)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums text-gray-900">{usd(c.cur)}</td>
                {PART_COLS.map((col) => (
                  <PartCell key={col.key} v={c.parts[col.key]} />
                ))}
                <td className={`px-2.5 py-2 text-right font-medium tabular-nums ${c.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {signed(c.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 print:hidden">
          <span>
            Page {clamped + 1} of {pages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(clamped - 1)}
              disabled={clamped === 0}
              className="rounded-lg border border-gray-200 px-2.5 py-1 font-medium transition hover:bg-gray-50 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(clamped + 1)}
              disabled={clamped >= pages - 1}
              className="rounded-lg border border-gray-200 px-2.5 py-1 font-medium transition hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */

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
