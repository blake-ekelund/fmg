"use client";

import clsx from "clsx";
import { CalendarRange } from "lucide-react";
import { COMPARE_MODES, PERIOD_PRESETS, type CompareMode, type PeriodPreset, type ReportPeriod, type ResolvedPeriod } from "@/lib/reports/reportPeriod";

/* The one place a report's period is set: every KPI, chart, table, the Excel
   file and "Email me a copy" read it. A viewer's pick is theirs alone; the
   report's owner (or an admin) can save it as the default the scheduled email
   uses. */

export default function PeriodBar({
  resolved,
  picked,
  saved,
  canEdit,
  busy,
  onChange,
  onSaveDefault,
}: {
  resolved: ResolvedPeriod;
  /** The viewer's own pick, or null when showing the report's default. */
  picked: ReportPeriod | null;
  saved: ReportPeriod;
  canEdit: boolean;
  busy: boolean;
  onChange: (p: ReportPeriod | null) => void;
  onSaveDefault: (p: ReportPeriod) => void;
}) {
  const p = resolved.period;
  const last = (() => {
    const d = new Date(`${resolved.range.to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const set = (next: Partial<ReportPeriod>) => {
    const merged: ReportPeriod = { ...p, ...next };
    if (merged.preset === "custom") {
      merged.from = merged.from ?? resolved.range.from;
      merged.to = merged.to ?? last;
    } else {
      delete merged.from;
      delete merged.to;
    }
    onChange(merged);
  };
  const differs = picked && JSON.stringify(picked) !== JSON.stringify(saved);
  const field = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <CalendarRange className="h-4 w-4 shrink-0 text-brand-600" />
      <label className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
        Period
        <select aria-label="Report period" className={field} value={p.preset} disabled={busy} onChange={(e) => set({ preset: e.target.value as PeriodPreset })}>
          {PERIOD_PRESETS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {p.preset === "custom" && (
        <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="date"
            aria-label="From"
            className={field}
            value={p.from ?? resolved.range.from}
            max={p.to ?? last}
            disabled={busy}
            onChange={(e) => e.target.value && set({ from: e.target.value })}
          />
          to
          <input
            type="date"
            aria-label="To"
            className={field}
            value={p.to ?? last}
            min={p.from ?? resolved.range.from}
            disabled={busy}
            onChange={(e) => e.target.value && set({ to: e.target.value })}
          />
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
        Compare to
        <select aria-label="Compare to" className={field} value={p.compare} disabled={busy} onChange={(e) => set({ compare: e.target.value as CompareMode })}>
          {COMPARE_MODES.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </label>

      <div className="min-w-0 flex-1 text-sm text-ink">
        <span className="font-semibold">{resolved.label}</span>
        {resolved.compareLabel && <span className="text-ink-muted"> vs {resolved.compareLabel}</span>}
      </div>

      {picked && (
        <div className="flex items-center gap-3 text-xs">
          {canEdit && differs && (
            <button
              onClick={() => onSaveDefault(picked)}
              disabled={busy}
              className="rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              title="Make this the period everyone sees first — and the one the scheduled email uses"
            >
              Save as default
            </button>
          )}
          <button onClick={() => onChange(null)} disabled={busy} className={clsx("text-ink-muted hover:text-ink disabled:opacity-50")}>
            Back to default
          </button>
        </div>
      )}
    </div>
  );
}
