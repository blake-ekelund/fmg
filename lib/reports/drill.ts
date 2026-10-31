import type { QuerySpec } from "@/lib/assistant/dataCatalog";
import { parseGroupKey } from "./dates";
import { periodEnd } from "./periods";
import type { Widget } from "./types";

/* Click-to-drill (business rule: every chart is clickable). Clicking a bar,
   point or slice opens a drawer with the detail behind it: what made up that
   number (a breakdown) and, where the data has them, the records themselves.
   Both are ordinary widgets run through /api/reports/preview under the
   viewer's role. Client-safe. */

type DrillConfig = {
  /** Columns to break a number down by, best first (the first not already charted is used). */
  breakdowns: string[];
  /** Row-level detail to list, when the dataset has it. */
  records?: { columns: string[]; order_by: string };
};

const DRILL: Record<string, DrillConfig> = {
  sales_by_product_month: { breakdowns: ["display_name", "brand", "segment", "fragrance"] },
  storefront_orders: {
    breakdowns: ["business_name", "source", "channel", "store"],
    records: { columns: ["number", "created_at", "source", "business_name", "contact_name", "total"], order_by: "total" },
  },
  sales_orders: {
    breakdowns: ["billtoname", "shiptostate", "channel"],
    records: { columns: ["num", "datecompleted", "billtoname", "shiptostate", "totalprice"], order_by: "totalprice" },
  },
  wholesale_customers: {
    breakdowns: ["name", "rep_name", "bill_to_state"],
    records: { columns: ["name", "bill_to_state", "rep_name", "last_order_date", "sales_2026", "lifetime_revenue"], order_by: "lifetime_revenue" },
  },
  d2c_customers: {
    breakdowns: ["name", "bill_to_state"],
    records: { columns: ["name", "email", "bill_to_state", "last_order_date", "lifetime_revenue"], order_by: "lifetime_revenue" },
  },
  inventory: { breakdowns: ["part"], records: { columns: ["part", "description", "on_hand", "available", "on_order"], order_by: "on_hand" } },
  units_sold_90d: { breakdowns: ["part"] },
  storefront_accounts: {
    breakdowns: ["business_name", "sales_rep", "signup_store"],
    records: { columns: ["business_name", "contact_name", "email", "role", "created_at"], order_by: "created_at" },
  },
  amazon_settlements: { breakdowns: ["settlement_id"], records: { columns: ["start_date", "end_date", "deposit_date", "sales", "total"], order_by: "start_date" } },
  tasks: { breakdowns: ["owner", "status", "priority"], records: { columns: ["name", "owner", "status", "priority", "due_date"], order_by: "due_date" } },
};

export type DrillTarget = {
  /** Raw x value of the clicked point (period start for time charts). */
  x: string | null;
  /** Raw series value(s) of the clicked series; null = the whole point. */
  series: string[] | null;
};

/** Filters that narrow the widget's query to the clicked point (and series). */
export function drillFilters(w: Widget, t: DrillTarget): NonNullable<QuerySpec["filters"]> {
  const [xKey, seriesKey] = w.query.group_by ?? [];
  const filters = [...(w.query.filters ?? [])];
  const x = parseGroupKey(xKey ?? "");
  if (x.column) {
    if (t.x === null) filters.push({ column: x.column, op: "is_null" });
    else if (x.bucket) {
      // Replace the chart's range with just this period.
      const others = filters.filter((f) => f.column !== x.column);
      others.push({ column: x.column, op: "gte", value: t.x }, { column: x.column, op: "lt", value: periodEnd(t.x, x.bucket) });
      filters.length = 0;
      filters.push(...others);
    } else filters.push({ column: x.column, op: "eq", value: t.x });
  }
  if (seriesKey && t.series?.length) {
    const s = parseGroupKey(seriesKey).column;
    filters.push(t.series.length === 1 ? { column: s, op: "eq", value: t.series[0] } : { column: s, op: "in", value: t.series });
  }
  return filters;
}

/** The drawer's widgets: a breakdown of the clicked number, then the records behind it. */
export function drillWidgets(w: Widget, t: DrillTarget): Widget[] {
  const cfg = DRILL[w.query.dataset];
  const filters = drillFilters(w, t);
  const charted = new Set((w.query.group_by ?? []).map((g) => parseGroupKey(g).column));
  const out: Widget[] = [];
  const breakdown = cfg?.breakdowns.find((c) => !charted.has(c));
  if (breakdown) {
    out.push({
      id: "drill-breakdown",
      type: "table",
      title: "What made up this number",
      query: { dataset: w.query.dataset, filters, group_by: [breakdown], metrics: w.query.metrics, limit: 15 },
      format: w.format,
      labels: w.labels,
    });
  }
  if (cfg?.records) {
    out.push({
      id: "drill-records",
      type: "table",
      title: "Records",
      query: { dataset: w.query.dataset, filters, columns: cfg.records.columns, order_by: cfg.records.order_by, descending: true, limit: 50 },
    });
  }
  return out;
}
