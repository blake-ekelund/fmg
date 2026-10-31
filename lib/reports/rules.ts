import { parseGroupKey } from "./dates";
import type { Widget } from "./types";

/**
 * The rules Sage follows when it builds or changes a report. They're set by
 * the business (edit them HERE) — not by whoever is chatting with Sage, who
 * can't change or waive them. They go into Sage's instructions (create_report
 * + "Sage recommends"); the ones a machine can check are checked by
 * lintWidgets():
 *   - "error"   → the widget is refused; Sage must fix it before saving.
 *   - "warning" → saved, but Sage is told to fix it straight away.
 * Presentation rules (currency as $x,xxx, brand colours, period labels like
 * Jan-26 / 2026 Q1, the period switcher and click-to-drill) are enforced by
 * the renderers in lib/reports/shape.ts and components/reports, so no report
 * can break them.
 */

export type HouseRule = { id: string; group: "Format" | "Data" | "Layout" | "Charts" | "Tables" | "KPIs"; text: string };

export const HOUSE_RULES: HouseRule[] = [
  // Presentation (the app enforces these; Sage must not work against them)
  { id: "currency", group: "Format", text: "All currency shows as $x,xxx — whole dollars with thousands commas, never cents or $12k abbreviations." },
  { id: "brand-colors", group: "Format", text: "Charts use brand colours: FMG navy and gold, Natural Inspirations green and Sassy raspberry whenever a series is a brand." },
  { id: "period-labels", group: "Format", text: "Months read Jan-26, Feb-26…; quarters read 2026 Q1; years 2026." },
  { id: "time-periods", group: "Charts", text: "Every chart over time lets the viewer switch the period (range and month/quarter/year), so build trends on a date bucket (\"<date>:month\") with relative dates." },
  { id: "drillable", group: "Charts", text: "Every chart is clickable — a click opens the detail behind that bar or point — so chart what someone will want to dig into, from a dataset with detail behind it." },
  // Data correctness
  { id: "sale-only", group: "Data", text: "Fishbowl revenue and units come from sales by product with type “Sale” only — never mix in discounts, shipping or credit returns." },
  { id: "paid-only", group: "Data", text: "Storefront/marketplace order counts and revenue include paid orders only (abandoned carts are unpaid)." },
  { id: "relative-dates", group: "Data", text: "Saved reports use relative dates (this month, last 30 days…) so they stay current — no fixed dates unless someone asks for a specific period." },
  { id: "same-window", group: "Data", text: "Compare like with like: month-to-date vs the same days last month or the same month last year, never a partial month against a full one without saying so." },
  { id: "state-names", group: "Data", text: "States are full names (Minnesota, not MN)." },
  // Layout
  { id: "story-order", group: "Layout", text: "Order: headline KPIs → one trend over time → a breakdown that explains it → a detail list to act on." },
  { id: "kpi-count", group: "Layout", text: "At most 4 KPI tiles — the numbers someone would act on, not every metric available." },
  { id: "widget-count", group: "Layout", text: "Keep a report to about 8 widgets; make a second report rather than an endless one." },
  { id: "titles", group: "Layout", text: "Plain titles that say the period: “Revenue by month (last 12)”, not “Revenue chart”." },
  // KPIs
  { id: "kpi-compare", group: "KPIs", text: "Every KPI over a period (this month, last 7 days…) has a comparison — prior period or same period last year — with a label saying which. Right-now counts (stock, open orders) don't need one." },
  // Charts
  { id: "time-line", group: "Charts", text: "Trends over time use line, area or bar charts on a month/week/day bucket — never pie." },
  { id: "category-bar", group: "Charts", text: "Comparing categories (products, states, reps) uses a bar chart sorted biggest first; line charts are only for time." },
  { id: "pie-limits", group: "Charts", text: "Pie only for share of a whole, one metric, 6 slices or fewer." },
  { id: "series-limit", group: "Charts", text: "No more than 6 series on one chart (the rest fold into “Other”); use a pivot for more." },
  { id: "bucket-span", group: "Charts", text: "Daily buckets for up to ~45 days, weekly up to ~6 months, monthly beyond that." },
  // Tables
  { id: "table-limit", group: "Tables", text: "Tables are a top-N (10–50 rows) sorted by what matters; the full list is in the Excel download." },
  { id: "table-columns", group: "Tables", text: "Tables show 3–7 useful columns — no ids or internal fields unless asked." },
  { id: "pivot-shape", group: "Tables", text: "Pivots put the longer list on rows and time across the top, at most ~12 columns." },
];

/** The house rules as one block for a prompt. */
export function houseRulesText(): string {
  return HOUSE_RULES.map((r) => `- ${r.text}`).join("\n");
}

export type Lint = { widget: string; level: "error" | "warning"; rule: string; message: string };

const DATE_LITERAL = /^\d{4}-\d{2}-\d{2}/;

/** Machine-checkable house rules over a whole report. */
export function lintWidgets(widgets: Widget[]): Lint[] {
  const out: Lint[] = [];
  const add = (w: Widget | null, level: Lint["level"], rule: string, message: string) =>
    out.push({ widget: w?.title ?? "(report)", level, rule, message });

  const kpis = widgets.filter((w) => w.type === "kpi");
  if (kpis.length > 4) add(null, "warning", "kpi-count", `${kpis.length} KPI tiles — keep it to the 4 that matter most.`);
  if (widgets.length > 10) add(null, "warning", "widget-count", `${widgets.length} widgets — consider splitting into two reports.`);

  for (const w of widgets) {
    const queries = [w.query, ...(w.compare_query ? [w.compare_query] : [])];
    for (const q of queries) {
      const filters = q.filters ?? [];
      const metricCols = (q.metrics ?? []).map((m) => m.column).filter(Boolean) as string[];
      if (q.dataset === "sales_by_product_month" && !filters.some((f) => f.column === "typename")) {
        add(w, "error", "sale-only", 'Sales-by-product queries must filter typename = "Sale" (otherwise discounts, shipping and credits are mixed in).');
      }
      if (q.dataset === "storefront_orders" && (metricCols.length || q.metrics?.length) && !filters.some((f) => f.column === "payment_status")) {
        add(w, "error", "paid-only", 'Order counts/revenue must filter payment_status = "paid" (unpaid rows are abandoned carts).');
      }
      const fixed = filters.filter((f) => [f.value].flat().some((v) => typeof v === "string" && DATE_LITERAL.test(v)));
      if (fixed.length) {
        add(w, "warning", "relative-dates", `Fixed date(s) on ${fixed.map((f) => f.column).join(", ")} — use @relative dates unless the user asked for that exact period.`);
      }
    }

    const groups = (w.query.group_by ?? []).map(parseGroupKey);
    const timeX = !!groups[0]?.bucket;

    if (w.type === "kpi") {
      // Only period KPIs ("this month", "last 7 days") — a right-now snapshot (stock, open orders) has no prior period.
      const period = (w.query.filters ?? []).some((f) => [f.value].flat().some((v) => typeof v === "string" && (v.startsWith("@") || DATE_LITERAL.test(v))));
      const summed = (w.query.metrics ?? []).some((m) => m.fn === "sum" || m.fn === "count");
      if (period && summed && !w.compare_query) add(w, "warning", "kpi-compare", "Add a compare_query (prior period or same period last year) with a compare_label.");
    }

    if (w.type === "chart") {
      if (w.chart === "pie") {
        if (timeX) add(w, "error", "time-line", "A trend over time can't be a pie — use line, area or bar.");
        if (groups.length > 1 || (w.query.metrics?.length ?? 0) > 1) add(w, "error", "pie-limits", "A pie takes one category and one metric.");
        if (!w.query.limit || w.query.limit > 6) add(w, "warning", "pie-limits", "Limit a pie to 6 slices (set limit: 6).");
      }
      if ((w.chart === "line" || w.chart === "area") && !timeX) {
        add(w, "warning", "category-bar", "Line/area charts are for time — bucket the x axis (e.g. created_at:month) or use a bar chart.");
      }
      if (!timeX && groups.length === 1 && !w.query.limit) {
        add(w, "warning", "category-bar", "Category charts should be a top-N: set a limit (e.g. 10–15).");
      }
    }

    if (w.type === "table") {
      const plain = !w.query.group_by?.length && !w.query.metrics?.length;
      if (!w.query.limit || w.query.limit > 50) add(w, "warning", "table-limit", "Make tables a top-N (limit 10–50) sorted by what matters.");
      if (plain && !w.query.columns?.length) add(w, "warning", "table-columns", "Pick 3–7 useful columns instead of all of them.");
      if (plain && (w.query.columns?.length ?? 0) > 8) add(w, "warning", "table-columns", "More than 8 columns — trim to what someone needs to act.");
    }

    if (w.type === "pivot") {
      if (groups[0]?.bucket && !groups[1]?.bucket) add(w, "warning", "pivot-shape", "Put time across the top (second group_by) and the category on rows.");
    }
  }
  return out;
}
