/**
 * Seasonal demand — what a product is expected to sell each month ahead.
 *
 * Blake's rule (2026-11-14): for products with a year of history, forecast a
 * month as LAST YEAR'S units for that same month × the product's current trend.
 * The flat "avg / mo" this replaces showed the same number through busy springs
 * and slow summers (Feb–Mar run ~1.6× an average month, Jun/Sep/Nov/Dec ~0.7×).
 *
 * The trend (decided with Blake):
 *   • window  — the last 6 complete months vs the same 6 months a year earlier.
 *               Recent enough to be the current pace, long enough that one odd
 *               month doesn't swing it, and it isn't skewed in January or by
 *               Sassy's Feb 2025 launch stock-up.
 *   • level   — each product's own trend, "steadied": blended toward its
 *               brand's trend in proportion to how little it sells
 *               (weight = LY / (LY + 300), so ~50 units/mo is a 50/50 blend),
 *               then capped to −75% … +100%.
 *
 * Products without that history (new, or no sales in the year-ago window) stay
 * flat, as before: the typed "avg / mo" if there is one, else last 90 days ÷ 3.
 * For products WITH history the seasonal forecast wins over a typed number.
 *
 * Pure math, no I/O: the same functions run in the browser (forecast page,
 * dashboard, Purchasing, product page) and on the server (bell, Sage's planner)
 * so every surface quotes the same numbers. Loading lives in
 * lib/seasonalDemandServer.ts.
 */

export type DemandMethod = "seasonal" | "manual" | "recent";

export type DemandProfile = {
  method: DemandMethod;
  /** Expected units for the current calendar month (index 0) and the 11
   *  after it. Repeats yearly past index 11. Fractional; round for display. */
  monthly: number[];
  /** Average of `monthly` — the 12-month average shown as "avg / mo". */
  avg: number;
  /** Applied trend (e.g. −0.25 = 25% down), seasonal only. */
  trend: number | null;
  /** The product's own raw trend and its brand's, seasonal only (for tooltips). */
  productTrend: number | null;
  brandTrend: number | null;
  /** Units sold in the last 12 complete months — the base being scaled. */
  last12: number | null;
  /** yyyy-mm of the first month in `monthly` (the current month when built). */
  startMonth: string;
};

export type MonthlyUnits = Map<string, Map<string, number>>; // part → yyyy-mm → units

export type DemandProductInput = {
  part: string;
  brand: string | null;
  /** The typed "avg / mo" (0/null = none). */
  avg_monthly_demand: number | null;
};

export const TREND_WINDOW_MONTHS = 6;
/** Units in the year-ago window at which a product's own trend gets half weight. */
export const TREND_SHRINK_UNITS = 300;
export const TREND_MIN = -0.75;
export const TREND_MAX = 1.0;

/* ─── Month helpers (calendar months, timezone-agnostic yyyy-mm keys) ─── */

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Fraction of the current month still to come (1 on the 1st, ~0 on the last day). */
export function remainingFraction(now: Date): number {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (days - now.getDate() + 1) / days;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function flatProfile(method: "manual" | "recent", avg: number, startMonth: string): DemandProfile {
  const a = Math.max(0, avg);
  return {
    method,
    monthly: Array(12).fill(a),
    avg: a,
    trend: null,
    productTrend: null,
    brandTrend: null,
    last12: null,
    startMonth,
  };
}

/**
 * Build every product's profile.
 *
 * `history` must cover at least the 18 complete months before `now` (the base
 * year plus the year-ago trend window); the current month's partial sales are
 * never used. `units90` is the last-90-days fallback for products without
 * history.
 */
export function buildDemandProfiles(
  products: DemandProductInput[],
  history: MonthlyUnits,
  units90: Map<string, number>,
  now: Date = new Date(),
): Map<string, DemandProfile> {
  const current = monthKey(now);
  const last = addMonths(current, -1); // last complete month
  const units = (part: string, key: string) => Math.max(0, history.get(part)?.get(key) ?? 0);
  const sumMonths = (part: string, from: string, count: number) => {
    let t = 0;
    for (let i = 0; i < count; i++) t += units(part, addMonths(from, i));
    return t;
  };

  const tyFrom = addMonths(last, -(TREND_WINDOW_MONTHS - 1)); // e.g. May … Oct
  const lyFrom = addMonths(tyFrom, -12); //                        same months a year back
  const baseFrom = addMonths(current, -12); //                     last 12 complete months

  type Hist = { ty: number; ly: number; last12: number };
  const hist = new Map<string, Hist>();
  for (const p of products) {
    const h = history.get(p.part);
    if (!h) continue;
    // The product must have been selling before the year-ago window opened, or
    // its "last year" months are pre-launch zeros (or a launch stock-up).
    let first: string | null = null;
    for (const [k, v] of h) if (v > 0 && (first === null || k < first)) first = k;
    if (first === null || first > lyFrom) continue;
    const ly = sumMonths(p.part, lyFrom, TREND_WINDOW_MONTHS);
    const last12 = sumMonths(p.part, baseFrom, 12);
    if (ly <= 0 || last12 <= 0) continue;
    hist.set(p.part, { ty: sumMonths(p.part, tyFrom, TREND_WINDOW_MONTHS), ly, last12 });
  }

  // Brand trend over the brand's products that have history.
  const brandTotals = new Map<string, { ty: number; ly: number }>();
  for (const p of products) {
    const h = hist.get(p.part);
    if (!h) continue;
    const key = p.brand ?? "";
    const t = brandTotals.get(key) ?? { ty: 0, ly: 0 };
    t.ty += h.ty;
    t.ly += h.ly;
    brandTotals.set(key, t);
  }
  const brandTrend = (brand: string | null) => {
    const t = brandTotals.get(brand ?? "");
    return t && t.ly > 0 ? t.ty / t.ly - 1 : 0;
  };

  const out = new Map<string, DemandProfile>();
  for (const p of products) {
    const h = hist.get(p.part);
    if (!h) {
      const typed = Number(p.avg_monthly_demand) || 0;
      out.set(
        p.part,
        typed > 0
          ? flatProfile("manual", typed, current)
          : flatProfile("recent", Math.round((units90.get(p.part) ?? 0) / 3), current),
      );
      continue;
    }
    const own = h.ty / h.ly - 1;
    const bt = brandTrend(p.brand);
    const w = h.ly / (h.ly + TREND_SHRINK_UNITS);
    const trend = clamp(w * own + (1 - w) * bt, TREND_MIN, TREND_MAX);
    const monthly = Array.from({ length: 12 }, (_, i) => units(p.part, addMonths(baseFrom, i)) * (1 + trend));
    out.set(p.part, {
      method: "seasonal",
      monthly,
      avg: monthly.reduce((a, b) => a + b, 0) / 12,
      trend,
      productTrend: own,
      brandTrend: bt,
      last12: h.last12,
      startMonth: current,
    });
  }
  return out;
}

/* ─── Using a profile ─── */

/** Demand for the month `i` months after the profile's start (wraps yearly). */
export function demandInMonth(p: DemandProfile, i: number): number {
  return p.monthly[((i % 12) + 12) % 12] ?? 0;
}

/** Months between the profile's start and `now` (normally 0). */
function offset(p: DemandProfile, now: Date): number {
  const [y1, m1] = p.startMonth.split("-").map(Number);
  return now.getFullYear() * 12 + now.getMonth() - (y1 * 12 + m1 - 1);
}

/**
 * Stock left at the end of the month `monthIndex` months from now (0 = end of
 * this month) — the forecast table's projection.
 */
export function projectStock(stock: number, p: DemandProfile, monthIndex: number, now: Date = new Date()): number {
  const o = offset(p, now);
  let v = stock - demandInMonth(p, o) * remainingFraction(now);
  for (let i = 1; i <= monthIndex; i++) v -= demandInMonth(p, o + i);
  return v;
}

/** How many months `stock` lasts from now, walking the monthly demand. */
export function monthsOfCover(stock: number, p: DemandProfile, now: Date = new Date()): number {
  if (p.avg <= 0) return Infinity;
  if (stock <= 0) return 0;
  const o = offset(p, now);
  let left = stock;
  // Rest of this month.
  const f = remainingFraction(now);
  const d0 = demandInMonth(p, o);
  if (d0 > 0 && left < d0 * f) return left / d0;
  left -= d0 * f;
  let cover = f;
  for (let i = 1; i <= 600; i++) {
    const d = demandInMonth(p, o + i);
    if (d > 0 && left < d) return cover + left / d;
    left -= d;
    cover += 1;
  }
  return cover;
}

/** Units needed over the next `months` months (fractional months allowed). */
export function demandAhead(p: DemandProfile, months: number, now: Date = new Date()): number {
  if (months <= 0) return 0;
  const o = offset(p, now);
  const f = remainingFraction(now);
  let total = demandInMonth(p, o) * Math.min(f, months);
  let left = months - f;
  for (let i = 1; left > 0; i++) {
    total += demandInMonth(p, o + i) * Math.min(1, left);
    left -= 1;
  }
  return total;
}

/** A one-line explanation for tooltips. */
export function describeDemand(p: DemandProfile): string {
  if (p.method === "manual") return "Flat — the typed avg / mo (not enough sales history for a seasonal forecast).";
  if (p.method === "recent") return "Flat — last 90 days of sales ÷ 3 (not enough history for a seasonal forecast).";
  const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
  return (
    `Seasonal — last year's units for each month × ${pct(p.trend)} trend ` +
    `(this product ${pct(p.productTrend)}, brand ${pct(p.brandTrend)}, last ${TREND_WINDOW_MONTHS} months vs a year ago).`
  );
}
