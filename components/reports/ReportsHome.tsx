"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { BarChart3, CalendarClock, ChevronRight, Loader2, Sparkles } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { openHelpAssistant } from "@/components/HelpAssistant";
import { useUser } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { reportsApi } from "@/lib/reports/client";
import { describeSchedule } from "@/lib/reports/schedule";
import { REPORT_TEMPLATES, SAGE_REPORT_PROMPTS } from "@/lib/reports/templates";
import type { Report } from "@/lib/reports/types";

/* The Reports page: saved custom reports (shared with the team), a Sage box to
   build a new one by describing it, and starter reports to preview and save. */

export default function ReportsHome() {
  const role = useUser().profile?.access ?? null;
  const [items, setItems] = useState<Report[] | null>(null);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    reportsApi<{ ready: boolean; items: Report[] }>("/api/reports")
      .then((r) => {
        setReady(r.ready);
        setItems(r.items);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load reports."));
  }, []);

  const allowed = getAllowedPaths(role);
  const templates = REPORT_TEMPLATES.filter((t) => allowed.some((p) => t.page === p || t.page.startsWith(p + "/")));

  const send = (q: string) => {
    if (!q.trim()) return;
    openHelpAssistant(q.trim());
    setAsk("");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageMeta title="Reports" description="Custom dashboards built with Sage — live numbers, emailed on your schedule." />

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Sparkles className="h-4 w-4 text-accent-600" /> Build a report with Sage
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Describe what you want to track — KPIs, charts, pivot tables — and when it should land in your inbox. Sage builds it, then suggests what else to add.
        </p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            send(ask);
          }}
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="e.g. Weekly NI wholesale sales by rep, emailed to me and Julie Mondays at 7am"
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-400 focus:outline-none"
          />
          <button type="submit" disabled={!ask.trim()} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">
            Ask Sage
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SAGE_REPORT_PROMPTS.map((p) => (
            <button key={p} onClick={() => send(p)} className="rounded-full border border-line px-3 py-1 text-xs text-ink-secondary hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              {p}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Saved reports</h2>
        {error ? (
          <div className="rounded-2xl border border-line bg-surface p-5 text-sm text-critical">{error}</div>
        ) : !items ? (
          <div className="flex items-center gap-2 p-6 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !ready ? (
          <div className="rounded-2xl border border-warning/30 bg-warning-soft p-5 text-sm text-warning">
            Saving reports needs a database update (migration 20261031000000). You can still preview the starter reports below.
          </div>
        ) : !items.length ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
            No reports yet. Ask Sage above, or start from one of the reports below.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map((r) => (
              <Link key={r.id} href={`/reports/${r.id}`} className="group flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-brand-300">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink group-hover:text-brand-700">{r.title}</div>
                  {r.description && <div className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{r.description}</div>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
                    <span>{r.widgets.length} {r.widgets.length === 1 ? "widget" : "widgets"}</span>
                    {r.owner_name && <span>By {r.owner_name}</span>}
                    {r.schedule && (
                      <span className={clsx("flex items-center gap-1", r.schedule_enabled ? "text-positive" : "")}>
                        <CalendarClock className="h-3 w-3" />
                        {describeSchedule(r.schedule)}
                        {r.schedule_enabled ? "" : " (paused)"}
                      </span>
                    )}
                    {r.last_run_status === "failed" && <span className="text-critical">Last email failed</span>}
                  </div>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle group-hover:text-brand-700" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {templates.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Start from a report</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {templates.map((t) => (
              <Link key={t.key} href={`/reports/new?template=${t.key}`} className="group rounded-2xl border border-line bg-surface p-4 hover:border-brand-300 hover:shadow-card">
                <BarChart3 className="h-5 w-5 text-brand-500" />
                <div className="mt-2 text-sm font-semibold text-ink group-hover:text-brand-700">{t.title}</div>
                <div className="mt-1 text-xs text-ink-muted">{t.description}</div>
                <div className="mt-2 text-[11px] text-ink-subtle">{t.widgets.length} widgets · preview with live data</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
