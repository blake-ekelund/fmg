"use client";

import clsx from "clsx";
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { WEEKDAYS, describeSchedule } from "@/lib/reports/schedule";
import type { Frequency, Schedule } from "@/lib/reports/types";

/* The "Schedule" dialog on a report: how often, what time (Central), which
   team members, Excel attached or not. Saving computes the next send. */

const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return {
    value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    label: `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`,
  };
});

const FREQ_LABEL: Record<Frequency, string> = { daily: "Every day", weekdays: "Weekdays (Mon–Fri)", weekly: "Weekly", monthly: "Monthly" };

export default function ScheduleEditor({
  initial,
  enabled,
  team,
  myEmail,
  onSave,
  onClose,
}: {
  initial: Schedule | null;
  enabled: boolean;
  team: { name: string; email: string }[];
  myEmail: string | null;
  onSave: (schedule: Schedule | null, enabled: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "weekly");
  const [time, setTime] = useState(initial?.time ?? "08:00");
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [monthday, setMonthday] = useState<number | "last">(initial?.monthday ?? 1);
  const [recipients, setRecipients] = useState<string[]>(initial?.recipients ?? (myEmail ? [myEmail.toLowerCase()] : []));
  const [attach, setAttach] = useState(initial?.attach_excel !== false);
  const [on, setOn] = useState(initial ? enabled : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft: Schedule = {
    frequency,
    time,
    recipients,
    attach_excel: attach,
    ...(frequency === "weekly" ? { weekday } : {}),
    ...(frequency === "monthly" ? { monthday } : {}),
  };

  async function save(schedule: Schedule | null) {
    setSaving(true);
    setError(null);
    try {
      await onSave(schedule, schedule ? on : false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  const toggle = (email: string) => setRecipients((r) => (r.includes(email) ? r.filter((x) => x !== email) : [...r, email]));
  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Email this report</h2>
            <p className="mt-0.5 text-sm text-ink-muted">Sent with live numbers each time. Team members only.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-medium text-ink-secondary sm:col-span-1">
            How often
            <select className={clsx(field, "mt-1")} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-xs font-medium text-ink-secondary sm:col-span-1">
            Time (Central)
            <select className={clsx(field, "mt-1")} value={time} onChange={(e) => setTime(e.target.value)}>
              {TIMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {frequency === "weekly" && (
            <label className="col-span-2 text-xs font-medium text-ink-secondary">
              Day
              <select className={clsx(field, "mt-1")} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          {frequency === "monthly" && (
            <label className="col-span-2 text-xs font-medium text-ink-secondary">
              Day of the month
              <select
                className={clsx(field, "mt-1")}
                value={String(monthday)}
                onChange={(e) => setMonthday(e.target.value === "last" ? "last" : Number(e.target.value))}
              >
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                <option value="last">Last day</option>
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 text-xs font-medium text-ink-secondary">Send to</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {team.map((m) => {
            const picked = recipients.includes(m.email);
            return (
              <button
                key={m.email}
                type="button"
                onClick={() => toggle(m.email)}
                title={m.email}
                className={clsx(
                  "flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition",
                  picked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink-secondary hover:border-line-strong",
                )}
              >
                {picked && <Check className="h-3 w-3" />}
                {m.name}
              </button>
            );
          })}
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Attach the full numbers as Excel
        </label>
        {initial && (
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-secondary">
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Sending is on (untick to pause)
          </label>
        )}

        <div className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-secondary">
          {recipients.length ? `${describeSchedule(draft)} to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}.` : "Pick at least one person."}
        </div>
        {error && <div className="mt-3 rounded-lg bg-critical-soft px-3 py-2 text-xs text-critical">{error}</div>}

        <div className="mt-5 flex items-center justify-between gap-2">
          {initial ? (
            <button onClick={() => save(null)} disabled={saving} className="text-sm text-critical hover:underline disabled:opacity-50">
              Remove schedule
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-secondary hover:bg-surface-muted">
              Cancel
            </button>
            <button
              onClick={() => save(draft)}
              disabled={saving || !recipients.length}
              className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
