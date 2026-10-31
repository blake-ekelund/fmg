import type { QuerySpec } from "@/lib/assistant/dataCatalog";
import type { Widget } from "./types";

/* Starter reports on the Reports page — a one-click start the user (or Sage)
   then tailors. Each names the page its data comes from, so the gallery only
   offers templates the viewer's role can actually see. All dates relative. */

export type ReportTemplate = {
  key: string;
  title: string;
  description: string;
  /** The page whose data it uses (getAllowedPaths gate). */
  page: string;
  widgets: Omit<Widget, "id">[];
};

const SALE = { column: "typename", op: "eq" as const, value: "Sale" };
const rev = (filters: QuerySpec["filters"]): QuerySpec => ({
  dataset: "sales_by_product_month",
  filters: [SALE, ...(filters ?? [])],
  metrics: [{ fn: "sum", column: "revenue" }],
});
const PAID = { column: "payment_status", op: "eq" as const, value: "paid" };

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    key: "sales-flash",
    title: "Monthly sales flash",
    description: "Revenue this month and year to date vs last year, the 13-month trend by channel, brand by month, and top products.",
    page: "/sales",
    widgets: [
      {
        type: "kpi",
        title: "Revenue this month",
        query: rev([{ column: "month", op: "gte", value: "@start_of_month" }]),
        compare_query: rev([{ column: "month", op: "eq", value: "@start_of_month-1y" }]),
        compare_label: "vs same month last year",
      },
      {
        type: "kpi",
        title: "Revenue year to date",
        query: rev([{ column: "month", op: "gte", value: "@start_of_year" }]),
        compare_query: rev([
          { column: "month", op: "gte", value: "@start_of_year-1y" },
          { column: "month", op: "lte", value: "@start_of_month-1y" },
        ]),
        compare_label: "vs last year YTD",
      },
      {
        type: "kpi",
        title: "Units shipped this month",
        format: "number",
        query: {
          dataset: "sales_by_product_month",
          filters: [SALE, { column: "month", op: "gte", value: "@start_of_month" }],
          metrics: [{ fn: "sum", column: "units_fulfilled" }],
        },
        compare_query: {
          dataset: "sales_by_product_month",
          filters: [SALE, { column: "month", op: "eq", value: "@start_of_month-1y" }],
          metrics: [{ fn: "sum", column: "units_fulfilled" }],
        },
        compare_label: "vs same month last year",
      },
      {
        type: "chart",
        chart: "stacked_bar",
        title: "Revenue by month — wholesale vs D2C",
        size: "full",
        query: { ...rev([{ column: "month", op: "gte", value: "@start_of_month-12m" }]), group_by: ["month:month", "segment"] },
      },
      {
        type: "pivot",
        title: "Brand × month",
        note: "Last 6 months, product revenue",
        query: { ...rev([{ column: "month", op: "gte", value: "@start_of_month-5m" }]), group_by: ["brand", "month:month"] },
      },
      {
        type: "table",
        title: "Top 15 products this year",
        query: {
          ...rev([{ column: "month", op: "gte", value: "@start_of_year" }]),
          group_by: ["display_name", "brand"],
          metrics: [
            { fn: "sum", column: "revenue" },
            { fn: "sum", column: "units_fulfilled" },
          ],
          limit: 15,
        },
      },
    ],
  },
  {
    key: "orders-daily",
    title: "Storefront & marketplace orders",
    description: "Yesterday's orders, the last 7 days vs the 7 before, daily orders by channel, and paid orders still without tracking.",
    page: "/storefronts/purchases",
    widgets: [
      {
        type: "kpi",
        title: "Orders yesterday",
        format: "number",
        query: {
          dataset: "storefront_orders",
          filters: [PAID, { column: "created_at", op: "gte", value: "@yesterday" }, { column: "created_at", op: "lt", value: "@today" }],
          metrics: [{ fn: "count" }],
        },
        compare_query: {
          dataset: "storefront_orders",
          filters: [PAID, { column: "created_at", op: "gte", value: "@yesterday-7d" }, { column: "created_at", op: "lt", value: "@today-7d" }],
          metrics: [{ fn: "count" }],
        },
        compare_label: "vs same day last week",
      },
      {
        type: "kpi",
        title: "Order revenue, last 7 days",
        query: {
          dataset: "storefront_orders",
          filters: [PAID, { column: "created_at", op: "gte", value: "@today-7d" }],
          metrics: [{ fn: "sum", column: "total" }],
        },
        compare_query: {
          dataset: "storefront_orders",
          filters: [PAID, { column: "created_at", op: "gte", value: "@today-14d" }, { column: "created_at", op: "lt", value: "@today-7d" }],
          metrics: [{ fn: "sum", column: "total" }],
        },
        compare_label: "vs prior 7 days",
      },
      {
        type: "kpi",
        title: "Paid orders not in Fishbowl",
        format: "number",
        query: {
          dataset: "storefront_orders",
          filters: [PAID, { column: "fishbowl_entered_at", op: "is_null" }, { column: "archived_at", op: "is_null" }],
          metrics: [{ fn: "count" }],
        },
      },
      {
        type: "chart",
        chart: "stacked_bar",
        title: "Orders per day by channel (30 days)",
        size: "full",
        query: {
          dataset: "storefront_orders",
          filters: [PAID, { column: "created_at", op: "gte", value: "@today-30d" }],
          group_by: ["created_at:day", "source"],
          metrics: [{ fn: "count" }],
        },
      },
      {
        type: "table",
        title: "Paid orders without tracking (last 30 days)",
        query: {
          dataset: "storefront_orders",
          columns: ["number", "created_at", "source", "business_name", "contact_name", "total", "scheduled_ship_date"],
          filters: [
            PAID,
            { column: "tracking_code", op: "is_null" },
            { column: "archived_at", op: "is_null" },
            { column: "created_at", op: "gte", value: "@today-30d" },
          ],
          order_by: "created_at",
          descending: false,
          limit: 50,
        },
      },
    ],
  },
  {
    key: "wholesale-health",
    title: "Wholesale customer health",
    description: "Active vs lapsed accounts, this year's sales by state, and the biggest accounts with last year alongside.",
    page: "/customers",
    widgets: [
      {
        type: "kpi",
        title: "Accounts ordering this year",
        format: "number",
        query: { dataset: "wholesale_customers", filters: [{ column: "last_order_date", op: "gte", value: "@start_of_year" }], metrics: [{ fn: "count" }] },
      },
      {
        type: "kpi",
        title: "Lapsed 6–18 months",
        note: "Last order between 6 and 18 months ago — win-back list",
        format: "number",
        query: {
          dataset: "wholesale_customers",
          filters: [
            { column: "last_order_date", op: "lt", value: "@today-6m" },
            { column: "last_order_date", op: "gte", value: "@today-18m" },
          ],
          metrics: [{ fn: "count" }],
        },
      },
      {
        type: "chart",
        chart: "bar",
        title: "Top states, sales this year",
        query: { dataset: "wholesale_customers", group_by: ["bill_to_state"], metrics: [{ fn: "sum", column: "sales_2026" }], limit: 12 },
        labels: { sum_sales_2026: "Sales this year" },
      },
      {
        type: "chart",
        chart: "pie",
        title: "Sales this year by rep",
        query: { dataset: "wholesale_customers", group_by: ["rep_name"], metrics: [{ fn: "sum", column: "sales_2026" }], limit: 8 },
        labels: { sum_sales_2026: "Sales this year" },
      },
      {
        type: "table",
        title: "Lapsed accounts to win back",
        query: {
          dataset: "wholesale_customers",
          columns: ["name", "bill_to_state", "rep_name", "last_order_date", "last_order_amount", "lifetime_revenue"],
          filters: [
            { column: "last_order_date", op: "lt", value: "@today-6m" },
            { column: "last_order_date", op: "gte", value: "@today-18m" },
          ],
          order_by: "lifetime_revenue",
          descending: true,
          limit: 25,
        },
      },
    ],
  },
  {
    key: "inventory-watch",
    title: "Inventory watch",
    description: "Parts out of stock in Fishbowl, the fastest sellers over 90 days, and what's on order.",
    page: "/inventory",
    widgets: [
      {
        type: "kpi",
        title: "Parts with nothing available",
        format: "number",
        query: { dataset: "inventory", filters: [{ column: "available", op: "lte", value: 0 }], metrics: [{ fn: "count" }] },
      },
      {
        type: "kpi",
        title: "Units on order",
        format: "number",
        query: { dataset: "inventory", metrics: [{ fn: "sum", column: "on_order" }] },
      },
      {
        type: "chart",
        chart: "bar",
        title: "Top sellers, last 90 days (units)",
        query: { dataset: "units_sold_90d", group_by: ["part"], metrics: [{ fn: "sum", column: "units_last_90_days" }], limit: 15 },
        format: "number",
        labels: { sum_units_last_90_days: "Units" },
      },
      {
        type: "table",
        title: "Lowest available stock",
        note: "Fishbowl figures — the Inventory page forecasts on Point B live counts",
        query: {
          dataset: "inventory",
          columns: ["part", "description", "on_hand", "allocated", "available", "on_order"],
          order_by: "available",
          descending: false,
          limit: 25,
        },
      },
    ],
  },
];

/** Quick asks for Sage on the Reports page. */
export const SAGE_REPORT_PROMPTS = [
  "Build me a weekly sales report and email it to me Mondays at 8am",
  "Make a dashboard of D2C orders, revenue and top products this month",
  "Create a report of wholesale customers who haven't reordered in 6 months",
  "Pivot of revenue by product and month for Natural Inspirations",
];
