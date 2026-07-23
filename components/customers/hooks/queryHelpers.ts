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
