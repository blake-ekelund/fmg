/**
 * Shared vocabulary for the sales-analysis page.
 *
 * The fragrance whitelist and the trailing-month math used to be copy-pasted
 * into SalesPage and TTMMatrix independently, so the chart series and the
 * matrix rows could silently drift apart. One definition, imported by both.
 */

export type MatrixMode = "products" | "fragrances";

/** Which slice of the business a sales-analysis page is reading. */
export type SalesChannel = "all" | "wholesale" | "d2c";

export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  all: "All",
  wholesale: "Wholesale",
  d2c: "D2C",
};


/** Fragrances broken out by name; everything else folds into "Other". */
export const ALLOWED_FRAGRANCES = new Set([
  "Sea Salt",
  "Grapefruit",
  "Lavender",
  "Eucalyptus",
  "Coconut",
  "Agave Pear",
  "Cypres",
  "Orange Ginger",
]);

export const OTHER_LABEL = "Other";

/** How many products the "products" mode breaks out before folding to Other. */
export const TOP_PRODUCT_LIMIT = 15;

/** First-of-month key, e.g. (2026, 0) -> "2026-01-01". `jsMonth` is 0-based. */
export function ym(year: number, jsMonth: number) {
  return `${year}-${String(jsMonth + 1).padStart(2, "0")}-01`;
}

/** The 12 month keys ending at (endYear, endMonth), oldest first. `endMonth` is 1-based. */
export function getTrailingMonths(endYear: number, endMonth: number) {
  const months: string[] = [];
  let y = endYear;
  let m = endMonth - 1;

  for (let i = 0; i < 12; i++) {
    months.push(ym(y, m));
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }

  return months.reverse();
}

export function formatMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

export function rowTTM(months: string[], byMonth: Record<string, number>) {
  return months.reduce((sum, m) => sum + (byMonth[m] ?? 0), 0);
}

/** Plain thousands-separated integer — callers add their own "$". */
export function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Compact money for tight spots: $1.2M / $340K / $980. */
export function fmtMoneyCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/**
 * Percent change vs a prior value. Returns null when there's no prior base to
 * compare against — a delta off a zero base is "new", not "+∞%".
 */
export function pctChange(current: number, prior: number): number | null {
  if (!prior) return null;
  return (current - prior) / prior;
}
