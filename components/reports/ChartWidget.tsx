"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2, Sparkles, X } from "lucide-react";
import { openHelpAssistant } from "@/components/HelpAssistant";
import { reportsApi } from "@/lib/reports/client";
import { drillWidgets } from "@/lib/reports/drill";
import { GRAIN_LABEL, RANGES, applyPeriod, defaultGrain, grainsFor, timeAxis, type Period, type RangeKey } from "@/lib/reports/periods";
import { chartData, formatOf, formatValue } from "@/lib/reports/shape";
import type { Widget, WidgetResult } from "@/lib/reports/types";
import { ChartBody, WidgetBody, type ChartClick } from "./WidgetView";

/* A chart card on a report. Business rules live here: charts over time get a
   period switcher (range + day/week/month/quarter/year), and every bar, point
   or slice opens a drawer with the detail behind it. The viewer's period
   choice is theirs alone; an editor can save it as the chart's default. */

type Ok = Extract<WidgetResult, { ok: true }>;

export default function ChartWidget({
  w,
  r,
  menu,
  canEdit,
  onSaveDefault,
}: {
  w: Widget;
  r: WidgetResult | undefined;
  menu?: React.ReactNode;
  canEdit: boolean;
  onSaveDefault: (w: Widget) => void;
}) {
  const axis = timeAxis(w);
  // The page remounts this (via `key`) when the definition or results change, resetting the period.
  const [period, setPeriod] = useState<Period | null>(null);
  const [override, setView] = useState<{ w: Widget; r: WidgetResult | undefined } | null>(null);
  const view = override ?? { w, r };
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<ChartClick | null>(null);

  async function choose(p: Period) {
    setPeriod(p);
    const next = applyPeriod(w, p);
    setLoading(true);
    try {
      const out = await reportsApi<{ widgets: Widget[]; results: WidgetResult[] }>("/api/reports/preview", { method: "POST", body: { widgets: [next] } });
      setView({ w: out.widgets[0], r: out.results[0] });
    } catch (e) {
      setView({ w: next, r: { id: next.id, ok: false, error: e instanceof Error ? e.message : "Couldn't load that period." } });
    } finally {
      setLoading(false);
    }
  }

  const select = "rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-secondary focus:border-brand-400 focus:outline-none";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{w.title}</h2>
          {w.note && <p className="mt-0.5 text-xs text-ink-muted">{w.note}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {axis && (
            <>
              <select
                aria-label="Time period"
                className={select}
                value={period?.range ?? ""}
                onChange={(e) => {
                  const range = e.target.value as RangeKey;
                  if (range) void choose({ range, grain: defaultGrain(w, range) });
                }}
              >
                <option value="">{period ? "Custom" : "As built"}</option>
                {RANGES.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
              {period && (
                <div className="flex overflow-hidden rounded-md border border-line">
                  {grainsFor(w, period.range).map((g) => (
                    <button
                      key={g}
                      onClick={() => choose({ ...period, grain: g })}
                      className={clsx("px-2 py-1 text-xs", period.grain === g ? "bg-brand-700 text-white" : "bg-surface text-ink-secondary hover:bg-surface-muted")}
                    >
                      {GRAIN_LABEL[g]}
                    </button>
                  ))}
                </div>
              )}
              {period && canEdit && (
                <button onClick={() => onSaveDefault(view.w)} className="text-xs text-brand-700 hover:underline" title="Make this the period everyone sees first">
                  Save as default
                </button>
              )}
            </>
          )}
          {menu}
        </div>
      </div>

      <div className="relative [&_*:focus]:outline-none">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          </div>
        )}
        {view.r?.ok && view.r.rows.length ? (
          <>
            <ChartBody w={view.w} r={view.r} onPick={setPick} />
            <div className="mt-1 text-right text-[11px] text-ink-subtle">Click a bar or point for the detail</div>
          </>
        ) : (
          <WidgetBody w={view.w} r={view.r} />
        )}
      </div>

      {pick && view.r?.ok && <DrillDrawer w={view.w} r={view.r} pick={pick} onClose={() => setPick(null)} />}
    </>
  );
}

function DrillDrawer({ w, r, pick, onClose }: { w: Widget; r: Ok; pick: ChartClick; onClose: () => void }) {
  const c = useMemo(() => chartData(w, r), [w, r]);
  const point = c.points[pick.index];
  const series = pick.seriesKey ? c.series.find((s) => s.key === pick.seriesKey) ?? null : null;
  const f = formatOf(w);
  const keys = series ? [series.key] : c.series.map((s) => s.key);
  const sumAt = (i: number) => (c.points[i] ? keys.reduce((a, k) => a + (Number(c.points[i][k]) || 0), 0) : null);
  const value = sumAt(pick.index);
  const isTime = !!timeAxis(w);
  const prev = isTime && pick.index > 0 ? sumAt(pick.index - 1) : null;
  const total = c.points.reduce((a, _, i) => a + (sumAt(i) ?? 0), 0);
  const delta = value != null && prev ? (value - prev) / Math.abs(prev) : null;
  const heading = [point ? String(point.x) : "", series ? series.label : ""].filter(Boolean).join(" · ");

  const [detail, setDetail] = useState<{ widgets: Widget[]; results: WidgetResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const widgets = useMemo(() => {
    const p = c.points[pick.index];
    const s = pick.seriesKey ? c.series.find((x) => x.key === pick.seriesKey) : null;
    return drillWidgets(w, { x: (p?._x as string | null) ?? null, series: s?.raw ?? null });
  }, [w, c, pick]);
  useEffect(() => {
    if (!widgets.length) return;
    let live = true;
    reportsApi<{ widgets: Widget[]; results: WidgetResult[] }>("/api/reports/preview", { method: "POST", body: { widgets } })
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load the detail."));
    return () => {
      live = false;
    };
  }, [widgets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ask = () =>
    openHelpAssistant(
      `Analyze "${w.title}" for ${heading}: ${formatValue(value, f)}${
        prev != null ? ` vs ${formatValue(prev, f)} the period before` : ""
      }. What drove it, and what should I do about it?`,
    );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Detail for ${heading}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">{w.title}</div>
            <div className="mt-0.5 text-lg font-semibold text-ink">{heading}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-3">
              <div className="text-[11px] text-ink-muted">{series ? series.label : "Total"}</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{formatValue(value, f)}</div>
              {delta != null && (
                <div className={clsx("mt-0.5 flex items-center gap-1 text-xs", delta >= 0 ? "text-positive" : "text-critical")}>
                  {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {Math.abs(delta * 100).toFixed(1)}% <span className="text-ink-muted">vs {String(c.points[pick.index - 1]?.x)} ({formatValue(prev, f)})</span>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="text-[11px] text-ink-muted">Share of the chart</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{total && value != null ? `${((value / total) * 100).toFixed(1)}%` : "—"}</div>
              <div className="mt-0.5 text-xs text-ink-muted">of {formatValue(total, f)} shown</div>
            </div>
          </div>

          <button onClick={ask} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2 text-sm font-medium text-ink hover:bg-accent-100">
            <Sparkles className="h-4 w-4 text-accent-600" /> Ask Sage to analyze this
          </button>

          {error && <div className="rounded-lg bg-critical-soft px-3 py-2 text-xs text-critical">{error}</div>}
          {!detail && !error && widgets.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the detail…
            </div>
          )}
          {detail?.widgets.map((dw, i) => (
            <section key={dw.id}>
              <h3 className="mb-2 text-sm font-semibold text-ink">{dw.title}</h3>
              <WidgetBody w={dw} r={detail.results[i]} />
            </section>
          ))}
          {!widgets.length && <div className="text-xs text-ink-muted">There&apos;s no further detail behind this number.</div>}
        </div>
      </aside>
    </div>
  );
}
