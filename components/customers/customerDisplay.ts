/**
 * Presentation helpers shared by the desktop table, the mobile card list, and
 * the card grid. These were copy-pasted into three components with small
 * divergences (one rendered "--" for empty, the others "—").
 */

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Abbreviated customer counts for the status pills: 2.4k, 1.6k, 0.5k.
 *
 * The four pills sit in one strip that has to fit a phone; "Churned (1,567)"
 * is wider than it is informative when you're picking a filter. Every non-zero
 * count uses the same x.xk shape so the pills stay a constant width and don't
 * reflow as the filters change the numbers underneath them.
 *
 * Money is NOT abbreviated — revenue figures stay exact (see formatMoney).
 */
export function formatCompactCount(n: number): string {
  // "0.0k" reads badly on an empty result set.
  if (n === 0) return "0";
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * Parse a value from a date column without letting the timezone shift it.
 *
 * `new Date("2026-07-02")` is parsed as UTC midnight per spec, so
 * toLocaleDateString renders it as Jul 1 anywhere west of UTC — every
 * last-order date in the app was displaying a day early. A date-only string
 * has no time component to honour, so build it in local time instead.
 * Full timestamps still parse normally.
 */
function parseDisplayDate(d: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(d);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return parseDisplayDate(d).toLocaleDateString();
}

/** "Mar 12, 25" — narrow enough for a phone metrics row. */
export function formatShortDate(d: string | null | undefined): string {
  if (!d) return "—";
  return parseDisplayDate(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export type CustomerStatusBadge = { label: string; color: string };

/**
 * Account health from recency of last order. Mirrors the active/at-risk/churned
 * cutoffs the list queries use (see hooks/queryHelpers.getStatusCutoffs) —
 * change one and change the other.
 */
export function getCustomerStatus(
  lastOrderDate: string | null | undefined,
  hasOpenOrder = false,
): CustomerStatusBadge {
  /* An estimate out or an order on the bench means the account is live,
     whatever the last *completed* order says. Chasing these as lapsed is both
     wrong internally and embarrassing in front of the customer. */
  if (hasOpenOrder) {
    return { label: "Active", color: "bg-emerald-50 text-emerald-700" };
  }
  if (!lastOrderDate) {
    return { label: "No Orders", color: "bg-slate-100 text-slate-600" };
  }
  const diffDays =
    (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 180)
    return { label: "Active", color: "bg-emerald-50 text-emerald-700" };
  if (diffDays <= 365)
    return { label: "At Risk", color: "bg-amber-50 text-amber-700" };
  return { label: "Churned", color: "bg-rose-50 text-rose-700" };
}
