"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { describeSchedule } from "@/lib/reports/schedule";
import type { Report } from "@/lib/reports/types";

/* "Delete this report?" — the same dialog from the reports list and from inside
   a report. Says plainly what goes with it: the report for everyone, and its
   scheduled email if it has one. */

export default function DeleteReportDialog({
  report,
  busy,
  onCancel,
  onConfirm,
}: {
  report: Pick<Report, "title" | "schedule" | "schedule_enabled"> | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const s = report?.schedule;
  const people = s?.recipients.length ?? 0;
  return (
    <ConfirmDialog open={!!report} title="Delete this report?" confirmLabel="Delete report" tone="danger" busy={busy} onCancel={onCancel} onConfirm={onConfirm}>
      {report && (
        <>
          <p>
            <span className="font-semibold text-gray-900">“{report.title}”</span> will be removed for everyone on the team.
          </p>
          {s && (
            <p className="mt-2">
              Its scheduled email stops too — {describeSchedule(s).replace(/^./, (c) => c.toLowerCase())} to {people} {people === 1 ? "person" : "people"}
              {report.schedule_enabled ? "" : " (currently paused)"}.
            </p>
          )}
          <p className="mt-2 text-sm text-gray-500">This can&apos;t be undone.</p>
        </>
      )}
    </ConfirmDialog>
  );
}
