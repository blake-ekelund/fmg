"use client";

import Link from "next/link";
import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  Columns2,
  Download,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { openHelpAssistant } from "@/components/HelpAssistant";
import { downloadReport, reportsApi } from "@/lib/reports/client";
import { describeSchedule } from "@/lib/reports/schedule";
import ChartWidget from "./ChartWidget";
import { CHART_KINDS, type ChartKind, type Report, type Schedule, type Widget, type WidgetResult } from "@/lib/reports/types";
import ScheduleEditor from "./ScheduleEditor";
import { KpiTile, WidgetBody } from "./WidgetView";

/* One custom report: live KPI tiles, charts, pivots and tables (re-run on every
   view under the viewer's role), plus — for its creator or an admin — layout
   tweaks, the email schedule, and Sage's recommended additions. Charts carry
   their own period switcher and click-to-drill drawer (ChartWidget). */

type Loaded = {
  report: Report;
  results: WidgetResult[];
  canEdit: boolean;
  team: { name: string; email: string }[];
  myEmail: string | null;
  ranAt: string;
};

type Suggestion = { why: string; widget: Widget };

const CHART_LABEL: Record<ChartKind, string> = { bar: "Bar", stacked_bar: "Stacked bar", line: "Line", area: "Area", pie: "Pie" };

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

export default function ReportDetail({ id }: { id: string }) {
  const router = useRouter();
  const v = useSearchParams().get("v");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await reportsApi<Loaded>(`/api/reports/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the report.");
    }
  }, [id]);

  // `v` changes when Sage edits this report (its "Open report" link), so reload.
  useEffect(() => {
    void load();
  }, [load, v]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  /** Save a change; layout edits keep the results already on screen. */
  async function patch(body: Record<string, unknown>, rerun = false) {
    const out = await reportsApi<{ report: Report }>(`/api/reports/${id}`, { method: "PATCH", body });
    if (rerun) await load();
    else setData((d) => (d ? { ...d, report: { ...d.report, ...out.report } } : d));
  }

  const setWidgets = (widgets: Widget[], rerun = false) => {
    setData((d) => (d ? { ...d, report: { ...d.report, widgets } } : d));
    return run("save", () => patch({ widgets }, rerun));
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <BackLink />
        <div className="mt-4 rounded-2xl border border-line bg-surface p-6 text-sm text-critical">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Running the report…
      </div>
    );
  }

  const { report, results, canEdit } = data;
  const byId = new Map(results.map((r) => [r.id, r]));
  const kpis = report.widgets.filter((w) => w.type === "kpi");
  const blocks = report.widgets.filter((w) => w.type !== "kpi");
  const widgets = report.widgets;

  const move = (w: Widget, dir: -1 | 1) => {
    // Move within its own group (KPIs stay a row on top).
    const group = widgets.filter((x) => (x.type === "kpi") === (w.type === "kpi"));
    const gi = group.indexOf(w);
    const other = group[gi + dir];
    if (!other) return;
    const next = [...widgets];
    const a = next.indexOf(w), b = next.indexOf(other);
    [next[a], next[b]] = [next[b], next[a]];
    void setWidgets(next);
  };
  const change = (w: Widget, p: Partial<Widget>) => void setWidgets(widgets.map((x) => (x.id === w.id ? { ...x, ...p } : x)));
  const remove = (w: Widget) => {
    if (confirm(`Remove “${w.title}” from this report?`)) void setWidgets(widgets.filter((x) => x.id !== w.id));
  };

  const widgetMenu = (w: Widget) =>
    canEdit && (
      <div className="relative">
        <button
          onClick={() => setMenu(menu === w.id ? null : w.id)}
          className="rounded-lg p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink"
          aria-label={`Options for ${w.title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menu === w.id && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-surface py-1 text-sm shadow-raised" onMouseLeave={() => setMenu(null)}>
            <MenuItem icon={ArrowUp} label="Move up" onClick={() => move(w, -1)} />
            <MenuItem icon={ArrowDown} label="Move down" onClick={() => move(w, 1)} />
            {w.type !== "kpi" && (
              <MenuItem
                icon={w.size === "half" ? Square : Columns2}
                label={w.size === "half" ? "Full width" : "Half width"}
                onClick={() => change(w, { size: w.size === "half" ? "full" : "half" })}
              />
            )}
            {w.type === "chart" && (
              <div className="border-t border-line px-3 py-2">
                <div className="mb-1 text-[11px] text-ink-muted">Chart type</div>
                <div className="flex flex-wrap gap-1">
                  {CHART_KINDS.map((k) => (
                    <button
                      key={k}
                      onClick={() => change(w, { chart: k })}
                      className={clsx("rounded-md px-2 py-0.5 text-xs", w.chart === k ? "bg-brand-700 text-white" : "bg-surface-muted text-ink-secondary hover:bg-surface-sunken")}
                    >
                      {CHART_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t border-line" />
            <MenuItem icon={Trash2} label="Remove" danger onClick={() => remove(w)} />
          </div>
        )}
      </div>
    );

  async function getSuggestions() {
    setSuggestions(null);
    await run("suggest", async () => {
      const out = await reportsApi<{ suggestions: Suggestion[] }>(`/api/reports/${id}/suggest`, { method: "POST" });
      setSuggestions(out.suggestions);
      if (!out.suggestions.length) setNotice("Sage didn't find anything worth adding right now.");
    });
  }

  async function addSuggestion(s: Suggestion) {
    setSuggestions((list) => list?.filter((x) => x !== s) ?? null);
    await run("save", () => patch({ widgets: [...widgets, s.widget] }, true));
  }

  const btn =
    "flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-secondary hover:border-line-strong hover:text-ink disabled:opacity-50";

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageMeta title={report.title} description={report.description ?? undefined} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <BackLink />
          {editingTitle && canEdit ? (
            <input
              autoFocus
              defaultValue={report.title}
              className="mt-1 w-full rounded-lg border border-line px-2 py-1 text-xl font-semibold text-ink"
              onBlur={(e) => {
                setEditingTitle(false);
                const title = e.target.value.trim();
                if (title && title !== report.title) {
                  setData((d) => (d ? { ...d, report: { ...d.report, title } } : d));
                  void run("save", () => patch({ title }));
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <h1
              className={clsx("mt-1 text-xl font-semibold text-ink", canEdit && "cursor-text hover:text-brand-700")}
              onClick={() => canEdit && setEditingTitle(true)}
              title={canEdit ? "Click to rename" : undefined}
            >
              {report.title}
            </h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {report.owner_name && <span>By {report.owner_name}</span>}
            <span>Live as of {timeAgo(data.ranAt)}</span>
            {report.schedule && (
              <span className={clsx("flex items-center gap-1", report.schedule_enabled ? "text-positive" : "text-ink-subtle")}>
                <CalendarClock className="h-3.5 w-3.5" />
                {describeSchedule(report.schedule)}
                {report.schedule_enabled ? "" : " — paused"}
              </span>
            )}
            {report.last_run_at && (
              <span className={report.last_run_status === "failed" ? "text-critical" : undefined} title={report.last_run_error ?? undefined}>
                Last email {report.last_run_status === "failed" ? "failed" : "sent"} {timeAgo(report.last_run_at)}
              </span>
            )}
          </div>
        </div>

        {(
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => run("refresh", load)} disabled={!!busy}>
              <RefreshCw className={clsx("h-4 w-4", busy === "refresh" && "animate-spin")} /> Refresh
            </button>
            <button className={btn} onClick={() => run("download", () => downloadReport(`/api/reports/${id}/export`, "report.xlsx"))} disabled={!!busy}>
              {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
            </button>
            <button
              className={btn}
              disabled={!!busy}
              onClick={() =>
                run("email", async () => {
                  await reportsApi(`/api/reports/${id}/send`, { method: "POST" });
                  setNotice(`Sent to ${data.myEmail ?? "you"}.`);
                })
              }
            >
              {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email me a copy
            </button>
            {canEdit && (
              <button className={btn} onClick={() => setScheduling(true)} disabled={!!busy}>
                <CalendarClock className="h-4 w-4" /> {report.schedule ? "Schedule" : "Schedule email"}
              </button>
            )}
            {canEdit && (
              <button className={btn} onClick={() => openHelpAssistant()} title="Ask Sage to add, change or remove anything on this report">
                <Sparkles className="h-4 w-4 text-accent-600" /> Ask Sage to change it
              </button>
            )}
            {canEdit && (
              <button
                className={clsx(btn, "hover:border-critical hover:text-critical")}
                disabled={!!busy}
                aria-label="Delete report"
                onClick={() => {
                  if (confirm(`Delete “${report.title}”? Its schedule stops too.`)) {
                    void run("delete", async () => {
                      await reportsApi(`/api/reports/${id}`, { method: "DELETE" });
                      router.push("/reports");
                    });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {notice && (
        <div className="flex items-center justify-between rounded-xl bg-surface-sunken px-4 py-2 text-sm text-ink-secondary">
          {notice}
          <button onClick={() => setNotice(null)} className="text-xs text-ink-muted hover:text-ink">
            Dismiss
          </button>
        </div>
      )}

      {!widgets.length && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <div className="text-sm text-ink-secondary">This report is empty.</div>
          <button onClick={() => openHelpAssistant(`Add to my report "${report.title}" (id ${report.id}): `)} className="mt-3 text-sm font-medium text-brand-700 hover:underline">
            Ask Sage what to put in it
          </button>
        </div>
      )}

      {kpis.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((w) => (
            <div key={w.id} className="group relative">
              <KpiTile w={w} r={byId.get(w.id)} />
              <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">{widgetMenu(w)}</div>
            </div>
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {blocks.map((w) => (
            <section key={w.id} className={clsx("min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card", w.size !== "half" && "lg:col-span-2")}>
              {w.type === "chart" ? (
                <ChartWidget
                  key={`${data.ranAt}:${JSON.stringify(w)}`}
                  w={w}
                  r={byId.get(w.id)}
                  menu={widgetMenu(w)}
                  canEdit={canEdit}
                  onSaveDefault={(next) => void setWidgets(widgets.map((x) => (x.id === w.id ? next : x)), true)}
                />
              ) : (
                <>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-ink">{w.title}</h2>
                      {w.note && <p className="mt-0.5 text-xs text-ink-muted">{w.note}</p>}
                    </div>
                    {widgetMenu(w)}
                  </div>
                  <WidgetBody w={w} r={byId.get(w.id)} />
                </>
              )}
            </section>
          ))}
        </div>
      )}

      {canEdit && (
        <section className="rounded-2xl border border-accent-200 bg-accent-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-accent-600" /> Sage recommends
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">What would make this report more useful — each one is tested on live data before it&apos;s shown.</p>
            </div>
            <button onClick={getSuggestions} disabled={!!busy} className={btn}>
              {busy === "suggest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {suggestions ? "Suggest again" : "Get recommendations"}
            </button>
          </div>
          {busy === "suggest" && <div className="mt-3 text-xs text-ink-muted">Sage is looking at the report and testing ideas… (about 20 seconds)</div>}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {suggestions.map((s) => (
                <div key={s.widget.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                        {s.widget.type === "chart" ? CHART_LABEL[s.widget.chart ?? "bar"] : s.widget.type === "kpi" ? "KPI" : s.widget.type}
                      </span>
                      <span className="truncate text-sm font-medium text-ink">{s.widget.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-secondary">{s.why}</p>
                  </div>
                  <button
                    onClick={() => addSuggestion(s)}
                    disabled={!!busy}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {scheduling && (
        <ScheduleEditor
          initial={report.schedule}
          enabled={report.schedule_enabled}
          team={data.team}
          myEmail={data.myEmail}
          onClose={() => setScheduling(false)}
          onSave={async (schedule: Schedule | null, enabled: boolean) => {
            await patch({ schedule, schedule_enabled: enabled });
            if (schedule) setNotice(`Scheduled: ${describeSchedule(schedule)}.`);
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
      <ArrowLeft className="h-3.5 w-3.5" /> Reports
    </Link>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Trash2; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx("flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-muted", danger ? "text-critical" : "text-ink-secondary")}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
