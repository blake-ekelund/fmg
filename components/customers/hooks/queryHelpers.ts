/**
 * Shared query helpers for the wholesale + D2C customer lists.
 */

/**
 * Build a safe `ilike` value for use inside a PostgREST `.or()` filter.
 *
 * `.or()` takes a comma-delimited logic tree, so an unescaped search term is
 * parsed as filter *syntax*, not as data. A customer named "COLOR, INC" — and
 * we have several — turns into two bogus filter terms and PostgREST answers
 * 400 PGRST100 ("failed to parse logic tree"). Parentheses and periods break
 * it the same way.
 *
 * Wrapping the value in double quotes makes PostgREST treat it as a literal.
 * Backslashes and double quotes have to be escaped to survive the quoting.
 */
export function orIlikeValue(term: string): string {
  const escaped = term.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

/** Build a full `col.ilike."%term%"` clause list for `.or()`. */
export function orIlikeClauses(columns: string[], term: string): string {
  const value = orIlikeValue(term);
  return columns.map((c) => `${c}.ilike.${value}`).join(",");
}

/**
 * Status-pill counts. `all` is queried independently rather than summed from
 * the three buckets — summing silently drops customers who have never ordered,
 * which made the "All" pill disagree with the pagination total.
 */
export type CustomerStats = {
  all: number;
  active: number;
  atRisk: number;
  churned: number;
};

export function getStatusCutoffs() {
  const now = new Date();
  const active = new Date(now);
  active.setDate(now.getDate() - 180);
  const risk = new Date(now);
  risk.setDate(now.getDate() - 365);
  return { active, risk };
}

/** Status buckets a customer can fall into, derived from `last_order_date`. */
export type CustomerStatus = "active" | "at_risk" | "churned" | "no_orders";

const STATUS_VALUES: string[] = ["active", "at_risk", "churned", "no_orders"];

export type StatusFilterPlan = {
  /** Comma-separated `.or()` members, or null when no status filter applies. */
  or: string | null;
  /**
   * True when the caller must also exclude open-order customers with a
   * top-level `.not(idColumn, "in", openCsv)`.
   */
  excludeOpen: boolean;
};

/**
 * Turn a multi-select of status buckets into one PostgREST `.or()` clause.
 *
 * The buckets are ranges over `last_order_date`, so selecting several of them
 * is simply the union of their clauses. Nothing selected means "All" — no
 * status restriction at all.
 *
 * Open orders (wholesale only) complicate this: a customer with a live
 * estimate reads as active however stale their last completed order is, so
 * they belong in the Active bucket and nowhere else. Rather than negating the
 * id list inside every other branch, note that:
 *   • if Active is selected, those customers are pulled in by the Active
 *     member anyway, so the union is already right; and
 *   • if it isn't, none of them belong in the result, so a single top-level
 *     `.not(...in)` removes them.
 * That keeps the logic tree flat and avoids in-tree negation entirely.
 */
export function planStatusFilter(
  statuses: string[],
  openCsv?: string | null,
  idColumn = "customerid",
): StatusFilterPlan {
  const wanted = statuses.filter((s) => STATUS_VALUES.includes(s));
  if (wanted.length === 0) return { or: null, excludeOpen: false };

  const { active, risk } = getStatusCutoffs();
  const activeIso = active.toISOString();
  const riskIso = risk.toISOString();

  const parts: string[] = [];
  for (const s of wanted) {
    if (s === "active") {
      parts.push(`last_order_date.gte.${activeIso}`);
      // Flattened into the top-level OR instead of nested — same union, and
      // one less level for the logic-tree parser to chew on.
      if (openCsv) parts.push(`${idColumn}.in.${openCsv}`);
    } else if (s === "at_risk") {
      parts.push(
        `and(last_order_date.lt.${activeIso},last_order_date.gte.${riskIso})`,
      );
    } else if (s === "churned") {
      parts.push(`last_order_date.lt.${riskIso}`);
    } else if (s === "no_orders") {
      parts.push(`last_order_date.is.null`);
    }
  }

  return {
    or: parts.join(","),
    excludeOpen: !!openCsv && !wanted.includes("active"),
  };
}

/* -------------------------------------------------- */
/* Last-order window                                   */
/* -------------------------------------------------- */

/**
 * Recency buckets over `last_order_date`.
 *
 * Overlaps the status pills on purpose but doesn't replace them: status is
 * three coarse bands (180d / 365d / older) built for triage, while this asks
 * "who bought recently enough to be worth a call this week". Both apply at
 * once when both are set.
 */
export type LastOrderWindow =
  | ""
  | "30d"
  | "60d"
  | "90d"
  | "6m"
  | "12m"
  | "over12m"
  /** Kept for the helper below: the summary views never carry a null
      last_order_date today, so it isn't offered as an option. */
  | "never";

export const LAST_ORDER_OPTIONS: { label: string; value: LastOrderWindow }[] = [
  { label: "Any last order", value: "" },
  { label: "Ordered in last 30 days", value: "30d" },
  { label: "Ordered in last 60 days", value: "60d" },
  { label: "Ordered in last 90 days", value: "90d" },
  { label: "Ordered in last 6 months", value: "6m" },
  { label: "Ordered in last 12 months", value: "12m" },
  { label: "No order in over 12 months", value: "over12m" },
];

/** Days back for each bucket that expresses "within N days". */
const WINDOW_DAYS: Record<string, number> = {
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "6m": 182,
  "12m": 365,
};

interface DateFilterable<T> {
  gte: (column: string, value: string | number) => T;
  lt: (column: string, value: string | number) => T;
  is: (column: string, value: null) => T;
  not: (column: string, operator: string, value: string) => T;
}

/** Apply a last-order window to either list's query. */
export function applyLastOrderWindow<T extends DateFilterable<T>>(
  query: T,
  window: LastOrderWindow | undefined,
): T {
  if (!window) return query;

  if (window === "never") return query.is("last_order_date", null);

  const cutoff = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  if (window === "over12m") {
    // "Over 12 months" means they DID order, just not lately — a customer with
    // no orders at all belongs in "Never ordered", not here.
    return query.lt("last_order_date", cutoff(365)).not("last_order_date", "is", "null");
  }

  const days = WINDOW_DAYS[window];
  return days ? query.gte("last_order_date", cutoff(days)) : query;
}
