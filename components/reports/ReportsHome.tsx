"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { openHelpAssistant } from "@/components/HelpAssistant";
import { reportsApi } from "@/lib/reports/client";
import SavedReportsTable, { type ReportRow } from "./SavedReportsTable";

/* The Reports page: every saved custom report in one table (open, rename,
   download, schedule, pause, delete) and a "Create new report" button that
   starts a Sage chat — Sage builds every report. */

type ListResponse = { ready: boolean; items: ReportRow[]; team: { name: string; email: string }[]; myEmail: string | null };

export const startNewReport = () => openHelpAssistant("I'd like to create a new report.");

export default function ReportsHome() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reportsApi<ListResponse>("/api/reports")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load reports."));
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <PageMeta title="Reports" description="Custom dashboards built with Sage — live numbers, emailed on your schedule." />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Saved reports</h2>
        <button
          onClick={startNewReport}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" /> Create new report
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-line bg-surface p-5 text-sm text-critical">{error}</div>
      ) : !data ? (
        <div className="flex items-center gap-2 p-6 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !data.ready ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft p-5 text-sm text-warning">
          Saving reports needs a database update (migration 20261031000000).
        </div>
      ) : !data.items.length ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center text-sm text-ink-muted">
          No reports yet. Click <span className="font-medium text-ink">Create new report</span> and tell Sage what you want to track.
        </div>
      ) : (
        <SavedReportsTable
          rows={data.items}
          setRows={(fn) => setData((d) => (d ? { ...d, items: fn(d.items) } : d))}
          team={data.team}
          myEmail={data.myEmail}
        />
      )}
    </div>
  );
}
