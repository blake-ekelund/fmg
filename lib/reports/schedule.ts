import { addYmdDays, zonedInstant, zonedYmd } from "./dates";
import { FREQUENCIES, type Frequency, type Schedule } from "./types";

/* When a scheduled report goes out. All times are Central (the business's
   zone); the cron runs every 15 minutes, so times snap to :00/:15/:30/:45. */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate whatever the page or Sage sent. Throws a readable error. */
export function normalizeSchedule(raw: unknown): Schedule {
  const r = (raw ?? {}) as Record<string, unknown>;
  const frequency = r.frequency as Frequency;
  if (!FREQUENCIES.includes(frequency)) throw new Error(`Schedule frequency must be one of ${FREQUENCIES.join(", ")}.`);
  const tm = String(r.time ?? "08:00").match(/^(\d{1,2}):(\d{2})$/);
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) throw new Error('Schedule time must be "HH:MM" (24-hour, Central).');
  // Snap to the cron's 15-minute grid.
  const minute = Math.round(Number(tm[2]) / 15) * 15;
  const hour = (Number(tm[1]) + (minute === 60 ? 1 : 0)) % 24;
  const time = `${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const recipients = [
    ...new Set(
      (Array.isArray(r.recipients) ? r.recipients : [])
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => EMAIL.test(e)),
    ),
  ].slice(0, 20);
  if (!recipients.length) throw new Error("A schedule needs at least one recipient email.");
  const out: Schedule = { frequency, time, recipients, attach_excel: r.attach_excel !== false };
  if (frequency === "weekly") {
    const wd = Number(r.weekday ?? 1);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) throw new Error("weekday must be 0 (Sunday) … 6 (Saturday).");
    out.weekday = wd;
  }
  if (frequency === "monthly") {
    if (r.monthday === "last") out.monthday = "last";
    else {
      const md = Number(r.monthday ?? 1);
      if (!Number.isInteger(md) || md < 1 || md > 28) throw new Error('monthday must be 1-28 or "last".');
      out.monthday = md;
    }
  }
  return out;
}

/** The first send strictly after `after`. */
export function nextRunAt(s: Schedule, after = new Date()): Date {
  const [hh, mm] = s.time.split(":").map(Number);
  let day = zonedYmd(after);
  for (let i = 0; i < 400; i++, day = addYmdDays(day, 1)) {
    const dow = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
    const lastDay = new Date(Date.UTC(day.y, day.m, 0)).getUTCDate();
    const due =
      s.frequency === "daily" ||
      (s.frequency === "weekdays" && dow >= 1 && dow <= 5) ||
      (s.frequency === "weekly" && dow === (s.weekday ?? 1)) ||
      (s.frequency === "monthly" && (s.monthday === "last" ? day.d === lastDay : day.d === (s.monthday ?? 1)));
    if (!due) continue;
    const at = zonedInstant(day, hh, mm);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("Couldn't work out the next send time.");
}

function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "Every Monday at 8:00 AM CT". */
export function describeSchedule(s: Schedule): string {
  const at = `at ${clock(s.time)} CT`;
  switch (s.frequency) {
    case "daily": return `Every day ${at}`;
    case "weekdays": return `Weekdays ${at}`;
    case "weekly": return `Every ${WEEKDAYS[s.weekday ?? 1]} ${at}`;
    case "monthly": return `Monthly on the ${s.monthday === "last" ? "last day" : ordinal(Number(s.monthday ?? 1))} ${at}`;
  }
}
