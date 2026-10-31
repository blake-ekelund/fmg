/**
 * Date helpers for custom reports — all in the business's time zone (Central).
 *
 * Relative dates: a filter value like "@start_of_month" or "@today-30d" is
 * resolved to a YYYY-MM-DD at run time, so a saved/scheduled report always
 * covers "this month" or "the last 30 days" rather than the dates it was built
 * on. Grammar: "@" + base [+|- N(d|w|m|y)], base one of today, yesterday,
 * start_of_week (Monday), start_of_month, start_of_quarter, start_of_year.
 *   @start_of_month-1m  → first of last month
 *   @today-7d           → a week ago
 *
 * Buckets: group_by "created_at:month" groups timestamps by month (also day,
 * week, quarter, year); the bucket value is the period's first day.
 */

export const TZ = "America/Chicago";
export const BUCKETS = ["day", "week", "month", "quarter", "year"] as const;
export type Bucket = (typeof BUCKETS)[number];

type Ymd = { y: number; m: number; d: number }; // m is 1-12

/** Calendar date of an instant, in Central time. */
export function zonedYmd(at: Date): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const fmtYmd = ({ y, m, d }: Ymd) => `${y}-${pad(m)}-${pad(d)}`;

/** Normalised date arithmetic via UTC (no DST in pure dates). */
function addDays(v: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(v.y, v.m - 1, v.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
function addMonths(v: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(v.y, v.m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: Math.min(v.d, last) };
}

function startOf(v: Ymd, unit: Bucket): Ymd {
  switch (unit) {
    case "day": return v;
    case "week": {
      const dow = new Date(Date.UTC(v.y, v.m - 1, v.d)).getUTCDay(); // 0 = Sunday
      return addDays(v, -((dow + 6) % 7));
    }
    case "month": return { y: v.y, m: v.m, d: 1 };
    case "quarter": return { y: v.y, m: Math.floor((v.m - 1) / 3) * 3 + 1, d: 1 };
    case "year": return { y: v.y, m: 1, d: 1 };
  }
}

const RELATIVE = /^@(today|yesterday|start_of_(week|month|quarter|year))(?:([+-])(\d{1,4})([dwmy]))?$/;

export function isRelativeDate(v: unknown): v is string {
  return typeof v === "string" && RELATIVE.test(v.trim());
}

/** "@start_of_month-1m" → "2026-09-01". Anything else is returned unchanged. */
export function resolveRelativeDate(v: unknown, now = new Date()): unknown {
  if (typeof v !== "string") return v;
  const m = v.trim().match(RELATIVE);
  if (!m) return v;
  const today = zonedYmd(now);
  let d =
    m[1] === "today" ? today
      : m[1] === "yesterday" ? addDays(today, -1)
        : startOf(today, m[2] as Bucket);
  if (m[3]) {
    const n = Number(m[4]) * (m[3] === "-" ? -1 : 1);
    d = m[5] === "d" ? addDays(d, n) : m[5] === "w" ? addDays(d, n * 7) : m[5] === "m" ? addMonths(d, n) : addMonths(d, n * 12);
  }
  return fmtYmd(d);
}

/** Split "created_at:month" → { column, bucket }. */
export function parseGroupKey(key: string): { column: string; bucket: Bucket | null } {
  const i = key.lastIndexOf(":");
  if (i > 0 && (BUCKETS as readonly string[]).includes(key.slice(i + 1))) {
    return { column: key.slice(0, i), bucket: key.slice(i + 1) as Bucket };
  }
  return { column: key, bucket: null };
}

/** A date / timestamp value → the first day of its bucket (YYYY-MM-DD), in Central time. */
export function bucketDate(v: unknown, bucket: Bucket): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  let ymd: Ymd;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    ymd = { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) };
  } else {
    const t = new Date(s);
    if (Number.isNaN(t.getTime())) return null;
    ymd = zonedYmd(t);
  }
  return fmtYmd(startOf(ymd, bucket));
}

/** Offset (minutes) of Central time from UTC at an instant, e.g. -300 in CDT. */
function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant of a Central-time wall clock (date + HH:MM). */
export function zonedInstant(v: Ymd, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(v.y, v.m - 1, v.d, hour, minute));
  const first = new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000);
  // Re-check across a DST edge.
  return new Date(guess.getTime() - tzOffsetMinutes(first) * 60000);
}

export { addDays as addYmdDays };
