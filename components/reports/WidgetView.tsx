"use client";

import clsx from "clsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import { chartData, formatCell, formatOf, formatValue, kpiDelta, labelFor, pivotize, seriesColors } from "@/lib/reports/shape";
import type { Widget, WidgetResult } from "@/lib/reports/types";

/* One report widget, drawn from its query result. The shaping (labels, value
   formats, pivots, series) lives in lib/reports/shape so the page, the email
   and the Excel file agree. */


type Ok = Extract<WidgetResult, { ok: true }>;

export function KpiTile({ w, r }: { w: Widget; r: WidgetResult | undefined }) {
  const f = formatOf(w);
  const delta = r?.ok ? kpiDelta(r.value, r.compare) : null;
  return (
    <div className="h-full rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
      <div className="text-xs font-medium text-ink-muted">{w.title}</div>
      {!r ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-surface-sunken" />
      ) : !r.ok ? (
        <WidgetError error={r.error} />
      ) : (
        <>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{formatValue(r.value, f)}</div>
          {delta != null && (
            <div className={clsx("mt-1 flex items-center gap-1 text-xs", delta >= 0 ? "text-positive" : "text-critical")}>
              {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              <span className="font-semibold tabular-nums">{Math.abs(delta * 100).toFixed(1)}%</span>
              <span className="text-ink-muted">
                {w.compare_label ?? "vs prior"} ({formatValue(r.compare, f, true)})
              </span>
            </div>
          )}
          {w.note && <div className="mt-1 text-[11px] text-ink-subtle">{w.note}</div>}
        </>
      )}
    </div>
  );
}

function WidgetError({ error }: { error: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

const axisTick = { fontSize: 11, fill: "#6b7b88" };

/** What a click on a chart hit: the point (by index) and, on a bar/slice, which series. */
export type ChartClick = { index: number; seriesKey: string | null };

/**
 * A chart, drawn with brand colours and $x,xxx money. `onPick` makes every
 * bar, point and slice clickable (the report page opens a detail drawer).
 */
export function ChartBody({ w, r, onPick }: { w: Widget; r: Ok; onPick?: (c: ChartClick) => void }) {
  const c = chartData(w, r);
  const f = formatOf(w);
  const axisFmt = (v: unknown) => formatValue(v, f, true);
  // A bar/slice click names its series first; the chart-level click then fires with the point.
  const pickedSeries = useRef<string | null>(null);
  const onChartClick = (state: unknown) => {
    const s = state as { activeTooltipIndex?: number | string | null } | null;
    const i = s?.activeTooltipIndex;
    const seriesKey = pickedSeries.current;
    pickedSeries.current = null;
    if (onPick && i !== undefined && i !== null && Number.isFinite(Number(i))) onPick({ index: Number(i), seriesKey });
  };
  const yWidth = f === "money" ? Math.min(96, 16 + 7 * formatValue(Math.max(...c.points.flatMap((p) => c.series.map((s) => Number(p[s.key]) || 0)), 0), f).length) : 56;
  const tooltip = (
    <Tooltip
      formatter={(v) => formatValue(v, f)}
      contentStyle={{ borderRadius: 12, border: "1px solid #e3e9ef", fontSize: 12 }}
      cursor={{ fill: "rgba(27,60,83,0.06)" }}
    />
  );
  const legend =
    c.series.length > 1 ? (
      <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} formatter={(v) => <span className="text-ink-secondary">{v}</span>} />
    ) : null;
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />;
  const xAxis = <XAxis dataKey="x" tick={axisTick} tickLine={false} axisLine={{ stroke: "#e3e9ef" }} interval="preserveStartEnd" minTickGap={12} />;
  const yAxis = <YAxis tickFormatter={axisFmt} tick={axisTick} tickLine={false} axisLine={false} width={yWidth} />;
  const clickable = onPick ? { cursor: "pointer" } : undefined;

  if (w.chart === "pie") {
    const s = c.series[0];
    const data = c.points.map((p) => ({ name: String(p.x), value: Number(p[s.key]) || 0 }));
    // Slices are categories, so a brand slice gets its brand colour.
    const colors = seriesColors(data.map((d) => d.name));
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart style={clickable}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="45%"
            outerRadius="80%"
            paddingAngle={1}
            stroke="#fff"
            onClick={(_, index) => onPick?.({ index, seriesKey: null })}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i]} />
            ))}
          </Pie>
          {tooltip}
          <Legend
            iconType="square"
            iconSize={9}
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => <span className="text-ink-secondary">{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (w.chart === "line" || w.chart === "area") {
    const Chart = w.chart === "line" ? LineChart : AreaChart;
    return (
      <ResponsiveContainer width="100%" height={260}>
        <Chart data={c.points} onClick={onChartClick} style={clickable}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {c.series.map((s) =>
            w.chart === "line" ? (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            ) : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stackId={c.series.length > 1 ? "a" : undefined}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.18}
                activeDot={{ r: 5 }}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    );
  }
  // bar / stacked_bar. Category bars with long labels read better horizontally.
  const horizontal = !w.chart?.startsWith("stacked") && c.series.length === 1 && c.points.length <= 15 && c.points.some((p) => String(p.x).length > 10);
  const stacked = w.chart === "stacked_bar";
  return (
    <ResponsiveContainer width="100%" height={horizontal ? Math.max(200, c.points.length * 26 + 30) : 260}>
      <BarChart data={c.points} layout={horizontal ? "vertical" : "horizontal"} barCategoryGap="18%" onClick={onChartClick} style={clickable}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={axisFmt} tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="x" tick={axisTick} tickLine={false} axisLine={false} width={140} />
          </>
        ) : (
          <>
            {xAxis}
            {yAxis}
          </>
        )}
        {tooltip}
        {legend}
        {c.series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={stacked ? "a" : undefined}
            fill={s.color}
            radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={36}
            onClick={() => (pickedSeries.current = s.key)}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function PivotBody({ w, r }: { w: Widget; r: Ok }) {
  const p = pivotize(w, r, 24);
  const f = formatOf(w, p.valueKey);
  const head = (v: string, key: string) => formatCell(v === "—" ? null : v, key, w);
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-surface-muted">
          <tr>
            <th className="sticky left-0 bg-surface-muted px-3 py-2 text-left font-semibold text-ink-secondary">{labelFor(p.rowKey, w)}</th>
            {p.colLabels.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-semibold text-ink-secondary">
                {head(c, p.colKey)}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold text-ink">Total</th>
          </tr>
        </thead>
        <tbody>
          {p.rowLabels.map((rk, i) => (
            <tr key={rk} className="border-t border-line">
              <td className="sticky left-0 max-w-[220px] truncate bg-surface px-3 py-1.5 text-ink-secondary" title={rk}>
                {head(rk, p.rowKey)}
              </td>
              {p.cells[i].map((v, j) => (
                <td key={j} className={clsx("px-3 py-1.5 text-right", v == null ? "text-ink-subtle" : "text-ink")}>
                  {v == null ? "—" : formatValue(v, f, true)}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right font-semibold text-ink">{formatValue(p.rowTotals[i], f, true)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-surface-muted">
          <tr className="border-t border-line-strong font-semibold text-ink">
            <td className="sticky left-0 bg-surface-muted px-3 py-2">Total</td>
            {p.colTotals.map((v, j) => (
              <td key={j} className="px-3 py-2 text-right">
                {formatValue(v, f, true)}
              </td>
            ))}
            <td className="px-3 py-2 text-right">{formatValue(p.grand, f, true)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TableBody({ w, r }: { w: Widget; r: Ok }) {
  const numeric = (c: string) => r.rows.slice(0, 20).some((row) => typeof row[c] === "number");
  return (
    <>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-muted">
            <tr>
              {r.columns.map((c) => (
                <th key={c} className={clsx("whitespace-nowrap px-3 py-2 font-semibold text-ink-secondary", numeric(c) ? "text-right" : "text-left")}>
                  {labelFor(c, w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={i} className="border-t border-line">
                {r.columns.map((c) => (
                  <td key={c} className={clsx("max-w-[260px] truncate px-3 py-1.5 text-ink", numeric(c) && "text-right tabular-nums")} title={String(row[c] ?? "")}>
                    {formatCell(row[c], c, w)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Grouped summaries report scanned rows as `total`, so only plain lists get the note. */}
      {!w.query.group_by?.length && !w.query.metrics?.length && r.total > r.rows.length && (
        <div className="mt-1.5 text-[11px] text-ink-subtle">
          Showing {r.rows.length.toLocaleString()} of {Math.max(r.total, r.rows.length).toLocaleString()} — the Excel download has everything.
        </div>
      )}
    </>
  );
}

/** A chart / pivot / table card's body. */
export function WidgetBody({ w, r }: { w: Widget; r: WidgetResult | undefined }) {
  if (!r) return <div className="h-48 animate-pulse rounded-lg bg-surface-sunken" />;
  if (!r.ok) return <WidgetError error={r.error} />;
  if (!r.rows.length) return <div className="py-10 text-center text-sm text-ink-subtle">No data for this period.</div>;
  if (w.type === "chart") return <ChartBody w={w} r={r} />;
  if (w.type === "pivot") return <PivotBody w={w} r={r} />;
  return <TableBody w={w} r={r} />;
}
