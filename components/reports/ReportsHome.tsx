"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Loader2, Sparkles } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { openHelpAssistant } from "@/components/HelpAssistant";
import { useUser } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { reportsApi } from "@/lib/reports/client";
import { REPORT_TEMPLATES, SAGE_REPORT_PROMPTS } from "@/lib/reports/templates";
import SavedReportsTable, { type ReportRow } from "./SavedReportsTable";

/* The Reports page: every saved custom report in one table (open, rename,
   download, schedule, pause, delete), a Sage box to build a new one by
   describing it, and starter reports to preview and save. */

type ListResponse = { ready: boolean; items: ReportRow[]; team: { name: string; email: string }[]; myEmail: string | null };

export default function ReportsHome() {
  const role = useUser().profile?.access ?? null;
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    reportsApi<ListResponse>("/api/reports")
      .then(setData)
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageMeta title="Reports" description="Custom dashboards built with Sage — live numbers, emailed on your schedule." />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Saved reports</h2>
        {error ? (
          <div className="rounded-2xl border border-line bg-surface p-5 text-sm text-critical">{error}</div>
        ) : !data ? (
          <div className="flex items-center gap-2 p-6 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !data.ready ? (
          <div className="rounded-2xl border border-warning/30 bg-warning-soft p-5 text-sm text-warning">
            Saving reports needs a database update (migration 20261031000000). You can still preview the starter reports below.
          </div>
        ) : !data.items.length ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
            No reports yet. Ask Sage below, or start from one of the starter reports.
          </div>
        ) : (
          <SavedReportsTable
            rows={data.items}
            setRows={(fn) => setData((d) => (d ? { ...d, items: fn(d.items) } : d))}
            team={data.team}
            myEmail={data.myEmail}
          />
        )}
      </section>

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
