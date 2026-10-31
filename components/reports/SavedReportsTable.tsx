"use client";

import Link from "next/link";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { CalendarClock, Download, ExternalLink, Loader2, Pause, Pencil, Play, Search, Trash2 } from "lucide-react";
import { downloadReport, reportsApi } from "@/lib/reports/client";
import { describeSchedule } from "@/lib/reports/schedule";
import type { Report, Schedule } from "@/lib/reports/types";
import ScheduleEditor from "./ScheduleEditor";

/* Every saved report as one table: open, rename, download, change or pause the
   email schedule, delete. Rows the viewer can't edit (someone else's report,
   and they're not an owner/admin) only get Open and Download. */

export type ReportRow = Report & { canEdit: boolean };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "—";

export default function SavedReportsTable({
  rows,
  setRows,
  team,
  myEmail,
}: {
  rows: ReportRow[];
  setRows: (fn: (rows: ReportRow[]) => ReportRow[]) => void;
  team: { name: string; email: string }[];
  myEmail: string | null;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<ReportRow | null>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => words.every((w) => `${r.title} ${r.description ?? ""} ${r.owner_name ?? ""}`.toLowerCase().includes(w)));
  }, [rows, q]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function patch(r: ReportRow, body: Record<string, unknown>) {
    const out = await reportsApi<{ report: Report }>(`/api/reports/${r.id}`, { method: "PATCH", body });
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...out.report } : x)));
  }

  const iconBtn = "rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-40";

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reports"
            className="w-full rounded-lg border border-line py-2 pl-8 pr-3 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        <span className="text-xs text-ink-muted">
          {shown.length} of {rows.length} {rows.length === 1 ? "report" : "reports"}
        </span>
      </div>
      {error && <div className="border-b border-line bg-critical-soft px-4 py-2 text-xs text-critical">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-surface-muted text-left text-xs font-semibold text-ink-secondary">
            <tr>
              <th className="px-4 py-2.5">Report</th>
              <th className="px-3 py-2.5">Owner</th>
              <th className="px-3 py-2.5">Email schedule</th>
              <th className="px-3 py-2.5">Last sent</th>
              <th className="px-3 py-2.5">Updated</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-line align-top hover:bg-surface-muted/50">
                <td className="max-w-[340px] px-4 py-3">
                  {renaming === r.id ? (
                    <input
                      autoFocus
                      defaultValue={r.title}
                      className="w-full rounded-md border border-line px-2 py-1 text-sm"
                      onBlur={(e) => {
                        setRenaming(null);
                        const title = e.target.value.trim();
                        if (title && title !== r.title) void act(`rename:${r.id}`, () => patch(r, { title }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <Link href={`/reports/${r.id}`} className="font-medium text-ink hover:text-brand-700">
                      {r.title}
                    </Link>
                  )}
                  {r.description && <div className="mt-0.5 line-clamp-1 text-xs text-ink-muted">{r.description}</div>}
                  <div className="mt-0.5 text-[11px] text-ink-subtle">
                    {r.widgets.length} {r.widgets.length === 1 ? "widget" : "widgets"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-secondary">{r.owner_name ?? "—"}</td>
                <td className="px-3 py-3">
                  {r.schedule ? (
                    <div>
                      <div className={clsx("flex items-center gap-1 text-xs font-medium", r.schedule_enabled ? "text-positive" : "text-ink-subtle")}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        {describeSchedule(r.schedule)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-muted">
                        {r.schedule_enabled ? `Next ${when(r.next_run_at)}` : "Paused"} · {r.schedule.recipients.length}{" "}
                        {r.schedule.recipients.length === 1 ? "recipient" : "recipients"}
                      </div>
                    </div>
                  ) : r.canEdit ? (
                    <button onClick={() => setScheduling(r)} className="text-xs font-medium text-brand-700 hover:underline">
                      + Add schedule
                    </button>
                  ) : (
                    <span className="text-xs text-ink-subtle">Not scheduled</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">
                  {r.last_run_at ? (
                    <span className={r.last_run_status === "failed" ? "text-critical" : "text-ink-secondary"} title={r.last_run_error ?? undefined}>
                      {r.last_run_status === "failed" ? "Failed " : ""}
                      {when(r.last_run_at)}
                    </span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-secondary">{when(r.updated_at)}</td>
                <td className="whitespace-nowrap px-4 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <Link href={`/reports/${r.id}`} className={iconBtn} title="Open">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <button
                      className={iconBtn}
                      title="Download Excel"
                      disabled={!!busy}
                      onClick={() => act(`dl:${r.id}`, () => downloadReport(`/api/reports/${r.id}/export`, "report.xlsx"))}
                    >
                      {busy === `dl:${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </button>
                    {r.canEdit && (
                      <>
                        <button className={iconBtn} title="Rename" onClick={() => setRenaming(r.id)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className={iconBtn} title={r.schedule ? "Change email schedule" : "Add email schedule"} onClick={() => setScheduling(r)}>
                          <CalendarClock className="h-4 w-4" />
                        </button>
                        {r.schedule && (
                          <button
                            className={iconBtn}
                            title={r.schedule_enabled ? "Pause emails" : "Resume emails"}
                            disabled={!!busy}
                            onClick={() => act(`pause:${r.id}`, () => patch(r, { schedule_enabled: !r.schedule_enabled }))}
                          >
                            {busy === `pause:${r.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : r.schedule_enabled ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        <button
                          className={clsx(iconBtn, "hover:text-critical")}
                          title="Delete"
                          disabled={!!busy}
                          onClick={() => {
                            if (!confirm(`Delete “${r.title}”?${r.schedule ? " Its scheduled emails stop too." : ""}`)) return;
                            void act(`del:${r.id}`, async () => {
                              await reportsApi(`/api/reports/${r.id}`, { method: "DELETE" });
                              setRows((list) => list.filter((x) => x.id !== r.id));
                            });
                          }}
                        >
                          {busy === `del:${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-muted">
                  No reports match “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {scheduling && (
        <ScheduleEditor
          initial={scheduling.schedule}
          enabled={scheduling.schedule_enabled}
          team={team}
          myEmail={myEmail}
          onClose={() => setScheduling(null)}
          onSave={(schedule: Schedule | null, enabled: boolean) => patch(scheduling, { schedule, schedule_enabled: enabled })}
        />
      )}
    </div>
  );
}
