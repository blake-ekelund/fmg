"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Sparkles, PauseCircle } from "lucide-react";
import { formatMoney } from "../utils/format";
import { ANALYSIS_YEARS, type AnalysisRow } from "../hooks/useCustomerSalesAnalysis";

type Dim = "fragrance" | "display_name";
type YearPick = number | "all";

type Item = {
  name: string;
  rev: Record<number, number>;
  units: Record<number, number>;
};

const DIM_LABEL: Record<Dim, { one: string; many: string }> = {
  fragrance: { one: "Fragrance", many: "fragrances" },
  display_name: { one: "Product", many: "products" },
};

const TOP_N = 10;

export default function SalesAnalysisTab({
  data,
  loading,
}: {
  data: AnalysisRow[];
  loading: boolean;
}) {
  const [cur, prev, prev2] = ANALYSIS_YEARS; // e.g. 2026, 2025, 2024
  const years = [prev2, prev, cur]; // chronological for display

  const [dim, setDim] = useState<Dim>("fragrance");
  const [yearPick, setYearPick] = useState<YearPick>(cur);
  const [showAll, setShowAll] = useState(false);
  const [showTable, setShowTable] = useState(false);

  /* Shipping lines aren't product sales. */
  const rows = useMemo(
    () =>
      data.filter((r) => {
        const p = r.display_name?.toLowerCase() ?? "";
        const f = r.fragrance?.toLowerCase() ?? "";
        return !p.includes("shipping") && !f.includes("shipping");
      }),
    [data]
  );

  /* Per-year totals. */
  const yearStats = useMemo(() => {
    const out: Record<number, { rev: number; units: number; frags: Set<string> }> = {};
    for (const y of years) out[y] = { rev: 0, units: 0, frags: new Set() };
    for (const r of rows) {
      const s = out[r.year];
      if (!s) continue;
      s.rev += r.revenue ?? 0;
      s.units += r.quantity ?? 0;
      if ((r.revenue ?? 0) > 0) s.frags.add((r.fragrance ?? "").trim() || "Unknown");
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /* Items for the chosen dimension. */
  const items = useMemo<Item[]>(() => {
    const map = new Map<string, Item>();
    for (const r of rows) {
      const name = ((r[dim] ?? "") as string).trim() || "Unknown";
      let it = map.get(name);
      if (!it) {
        it = { name, rev: {}, units: {} };
        map.set(name, it);
      }
      it.rev[r.year] = (it.rev[r.year] ?? 0) + (r.revenue ?? 0);
      it.units[r.year] = (it.units[r.year] ?? 0) + (r.quantity ?? 0);
    }
    return Array.from(map.values());
  }, [rows, dim]);

  const revOf = (it: Item, y: YearPick) =>
    y === "all" ? years.reduce((s, yy) => s + (it.rev[yy] ?? 0), 0) : it.rev[y] ?? 0;
  const unitsOf = (it: Item, y: YearPick) =>
    y === "all" ? years.reduce((s, yy) => s + (it.units[yy] ?? 0), 0) : it.units[y] ?? 0;

  /* What changed: this year vs last year. */
  const changes = useMemo(() => {
    const dropped = items
      .filter((it) => (it.rev[prev] ?? 0) > 0 && (it.rev[cur] ?? 0) <= 0)
      .sort((a, b) => (b.rev[prev] ?? 0) - (a.rev[prev] ?? 0));
    const added = items
      .filter((it) => (it.rev[cur] ?? 0) > 0 && (it.rev[prev] ?? 0) <= 0)
      .sort((a, b) => (b.rev[cur] ?? 0) - (a.rev[cur] ?? 0));
    const movers = items
      .filter((it) => (it.rev[cur] ?? 0) > 0 && (it.rev[prev] ?? 0) > 0)
      .map((it) => ({ it, delta: (it.rev[cur] ?? 0) - (it.rev[prev] ?? 0) }))
      .filter((m) => Math.abs(m.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { dropped, added, movers };
  }, [items, cur, prev]);

  /* Mix for the selected year. */
  const mix = useMemo(() => {
    const positive = items
      .map((it) => ({ it, rev: revOf(it, yearPick), units: unitsOf(it, yearPick) }))
      .filter((m) => m.rev > 0)
      .sort((a, b) => b.rev - a.rev);
    const credits = items.reduce((s, it) => {
      const v = revOf(it, yearPick);
      return v < 0 ? s + v : s;
    }, 0);
    const total = positive.reduce((s, m) => s + m.rev, 0);
    return { positive, credits, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, yearPick]);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8">Loading sales analysis...</div>;
  }
  if (!rows.length) {
    return <div className="text-sm text-gray-400 py-8">No sales in {prev2}–{cur}.</div>;
  }

  const maxYearRev = Math.max(1, ...years.map((y) => yearStats[y]?.rev ?? 0));
  const curRev = yearStats[cur]?.rev ?? 0;
  const prevRev = yearStats[prev]?.rev ?? 0;
  const pctOfLastYear = prevRev > 0 ? curRev / prevRev : null;

  const label = DIM_LABEL[dim];
  const visibleMix = showAll ? mix.positive : mix.positive.slice(0, TOP_N);
  const topRev = mix.positive[0]?.rev ?? 1;

  return (
    <div className="space-y-5">
      {/* ─── Year over year ─── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Year over year
          </h3>
          {pctOfLastYear != null && (
            <p className="text-sm text-gray-600">
              {cur} so far is{" "}
              <span
                className={clsx(
                  "font-semibold",
                  pctOfLastYear >= 1 ? "text-green-700" : "text-gray-900"
                )}
              >
                {Math.round(pctOfLastYear * 100)}%
              </span>{" "}
              of {prev}&apos;s full year
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {years.map((y) => {
            const s = yearStats[y];
            const isCur = y === cur;
            return (
              <div key={y} className="rounded-lg bg-gray-50 p-4">
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                  {y}
                  {isCur && " · to date"}
                </div>
                <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
                  {formatMoney(s?.rev ?? 0)}
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full", isCur ? "bg-blue-600" : "bg-gray-400")}
                    style={{ width: `${Math.max(0, ((s?.rev ?? 0) / maxYearRev) * 100)}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-500 tabular-nums">
                  {(s?.units ?? 0).toLocaleString()} units · {s?.frags.size ?? 0} fragrances
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Dimension toggle ─── */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">Break down by</span>
        <Segmented
          value={dim}
          onChange={(v) => {
            setDim(v as Dim);
            setShowAll(false);
          }}
          options={[
            { value: "fragrance", label: "Fragrance" },
            { value: "display_name", label: "Product" },
          ]}
        />
      </div>

      {/* ─── What changed ─── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          What changed · {cur} vs {prev}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ChangeList
            icon={<PauseCircle size={14} className="text-amber-600" />}
            title={`Bought in ${prev}, not yet in ${cur}`}
            empty={`They've reordered every ${label.one.toLowerCase()} from ${prev}.`}
            items={changes.dropped.map((it) => ({
              name: it.name,
              value: formatMoney(it.rev[prev] ?? 0),
              sub: `in ${prev}`,
            }))}
          />
          <ChangeList
            icon={<Sparkles size={14} className="text-blue-600" />}
            title={`New in ${cur}`}
            empty={`Nothing new compared with ${prev}.`}
            items={changes.added.map((it) => ({
              name: it.name,
              value: formatMoney(it.rev[cur] ?? 0),
            }))}
          />
          <ChangeList
            icon={<ArrowUpRight size={14} className="text-gray-500" />}
            title="Biggest swings"
            empty="No overlapping items to compare."
            items={changes.movers.map(({ it, delta }) => ({
              name: it.name,
              value: (
                <span
                  className={clsx(
                    "inline-flex items-center gap-0.5",
                    delta > 0 ? "text-green-700" : "text-red-600"
                  )}
                >
                  {delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {formatMoney(Math.abs(delta))}
                </span>
              ),
              sub: `${formatMoney(it.rev[prev] ?? 0)} → ${formatMoney(it.rev[cur] ?? 0)}`,
            }))}
          />
        </div>
      </section>

      {/* ─── Mix ─── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            What they buy · {yearPick === "all" ? `${prev2}–${cur}` : yearPick}
          </h3>
          <Segmented
            value={String(yearPick)}
            onChange={(v) => {
              setYearPick(v === "all" ? "all" : Number(v));
              setShowAll(false);
            }}
            options={[
              ...[cur, prev, prev2].map((y) => ({ value: String(y), label: String(y) })),
              { value: "all", label: "All 3 yrs" },
            ]}
          />
        </div>

        {mix.positive.length === 0 ? (
          <div className="text-sm text-gray-400 py-6">No purchases in this period.</div>
        ) : (
          <>
            <ul className="space-y-2.5">
              {visibleMix.map(({ it, rev, units }) => {
                const share = mix.total ? rev / mix.total : 0;
                return (
                  <li
                    key={it.name}
                    className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3"
                  >
                    <span className="text-sm text-gray-800 truncate" title={it.name}>
                      {it.name}
                    </span>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${(rev / topRev) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm tabular-nums text-right w-44">
                      <span className="font-medium text-gray-900">{formatMoney(rev)}</span>
                      <span className="text-gray-400">
                        {" "}
                        · {Math.round(share * 100)}% · {units.toLocaleString()} u
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              {mix.positive.length > TOP_N && (
                <button
                  onClick={() => setShowAll((s) => !s)}
                  className="text-blue-600 hover:underline"
                >
                  {showAll ? "Show top 10" : `Show all ${mix.positive.length} ${label.many}`}
                </button>
              )}
              {mix.credits < 0 && (
                <span>Excludes {formatMoney(mix.credits)} in credits/returns.</span>
              )}
            </div>
          </>
        )}
      </section>

      {/* ─── Full table (on demand) ─── */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <button
          onClick={() => setShowTable((s) => !s)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Full table by {label.one.toLowerCase()}
          </span>
          <span className="text-xs text-blue-600">{showTable ? "Hide" : "Show"}</span>
        </button>
        {showTable && (
          <div className="border-t border-gray-100 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="py-2 px-5 text-left font-medium">{label.one}</th>
                  {[cur, prev, prev2].map((y) => (
                    <th key={y} className="py-2 px-4 text-right font-medium">
                      {y}
                    </th>
                  ))}
                  <th className="py-2 px-5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...items]
                  .filter((it) => years.some((y) => (it.rev[y] ?? 0) !== 0))
                  .sort((a, b) => revOf(b, "all") - revOf(a, "all"))
                  .map((it) => (
                    <tr key={it.name} className="border-t border-gray-100">
                      <td className="py-1.5 px-5 text-gray-800">{it.name}</td>
                      {[cur, prev, prev2].map((y) => (
                        <td
                          key={y}
                          className={clsx(
                            "py-1.5 px-4 text-right tabular-nums",
                            (it.rev[y] ?? 0) === 0 ? "text-gray-300" : "text-gray-700"
                          )}
                        >
                          {(it.rev[y] ?? 0) === 0 ? "—" : formatMoney(it.rev[y])}
                        </td>
                      ))}
                      <td className="py-1.5 px-5 text-right tabular-nums font-medium">
                        {formatMoney(revOf(it, "all"))}
                      </td>
                    </tr>
                  ))}
                <tr className="border-t border-gray-200 font-semibold">
                  <td className="py-2 px-5">Total</td>
                  {[cur, prev, prev2].map((y) => (
                    <td key={y} className="py-2 px-4 text-right tabular-nums">
                      {formatMoney(yearStats[y]?.rev ?? 0)}
                    </td>
                  ))}
                  <td className="py-2 px-5 text-right tabular-nums">
                    {formatMoney(years.reduce((s, y) => s + (yearStats[y]?.rev ?? 0), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ─── Pieces ─── */

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "px-3 py-1 text-xs rounded-md transition-colors",
            value === o.value
              ? "bg-white text-gray-900 shadow-sm font-medium"
              : "text-gray-500 hover:text-gray-800"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChangeList({
  icon,
  title,
  empty,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  items: { name: string; value: React.ReactNode; sub?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 5);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-sm font-medium text-gray-800">{title}</span>
        {items.length > 0 && <span className="text-xs text-gray-400">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shown.map((i) => (
            <li key={i.name} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-sm text-gray-700 truncate" title={i.name}>
                {i.name}
              </span>
              <span className="text-right shrink-0">
                <span className="text-sm font-medium tabular-nums">{i.value}</span>
                {i.sub && (
                  <span className="block text-[11px] text-gray-400 tabular-nums">{i.sub}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {items.length > 5 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-xs text-blue-600 hover:underline"
        >
          {open ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
