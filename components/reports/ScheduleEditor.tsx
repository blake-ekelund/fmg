"use client";

import clsx from "clsx";
import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { WEEKDAYS, describeSchedule } from "@/lib/reports/schedule";
import type { Frequency, Schedule } from "@/lib/reports/types";

/* The "Schedule" dialog on a report: how often, what time (Central), which
   email addresses (team members only — suggested as you type), Excel attached
   or not. Saving computes the next send. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const [query, setQuery] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const teamEmails = new Set(team.map((m) => m.email.toLowerCase()));
  const nameOf = (email: string) => team.find((m) => m.email.toLowerCase() === email)?.name;

  const q = query.trim().toLowerCase();
  const suggestions = team.filter(
    (m) => !recipients.includes(m.email.toLowerCase()) && (!q || m.email.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
  );

  /** Add a typed address (or the only matching suggestion). Team addresses only. */
  function add(raw: string) {
    const v = raw.trim().replace(/[,;]+$/, "").toLowerCase();
    if (!v) return;
    const email = EMAIL.test(v) ? v : suggestions.length === 1 ? suggestions[0].email.toLowerCase() : null;
    if (!email) return setInputError(`“${raw.trim()}” isn't an email address.`);
    if (!teamEmails.has(email)) return setInputError(`${email} isn't on the FMG team — scheduled reports only go to team addresses.`);
    setRecipients((r) => (r.includes(email) ? r : [...r, email]));
    setQuery("");
    setInputError(null);
  }
  const removeRecipient = (email: string) => setRecipients((r) => r.filter((x) => x !== email));

  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Email this report</h2>
            <p className="mt-0.5 text-sm text-ink-muted">Sent with live numbers each time. FMG team addresses only.</p>
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

        <label htmlFor="report-recipients" className="mt-4 block text-xs font-medium text-ink-secondary">
          Send to
        </label>
        <div className="relative mt-1">
          <div
            className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-brand-400"
            onClick={() => inputRef.current?.focus()}
          >
            {recipients.map((email) => (
              <span key={email} className="flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs text-brand-700" title={nameOf(email)}>
                {email}
                <button
                  type="button"
                  onClick={() => removeRecipient(email)}
                  className="rounded-full p-0.5 hover:bg-brand-100"
                  aria-label={`Remove ${email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              id="report-recipients"
              ref={inputRef}
              type="email"
              autoComplete="off"
              value={query}
              placeholder={recipients.length ? "Add another email…" : "Type an email address…"}
              onChange={(e) => {
                setQuery(e.target.value);
                setInputError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                if (query.trim()) add(query);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
                  if (!query.trim()) return;
                  e.preventDefault();
                  add(query);
                } else if (e.key === "Backspace" && !query && recipients.length) {
                  removeRecipient(recipients[recipients.length - 1]);
                }
              }}
              className="min-w-[160px] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          {focused && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-overlay">
              {suggestions.map((m) => (
                <li key={m.email}>
                  <button
                    type="button"
                    // mousedown, not click — the input's blur would close the list first
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(m.email);
                    }}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface-muted"
                  >
                    <span className="truncate text-ink">{m.email}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {inputError && <p className="mt-1 text-xs text-critical">{inputError}</p>}

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
          {recipients.length ? `${describeSchedule(draft)} to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}.` : "Add at least one email address."}
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
