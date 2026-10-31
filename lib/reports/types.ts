import type { QuerySpec } from "@/lib/assistant/dataCatalog";

/**
 * A custom report = an ordered list of widgets, each a query over Sage's data
 * catalog (lib/assistant/dataCatalog) plus how to show it. Client-safe (types
 * and pure helpers only) — the page, the email and the Excel file all shape
 * results through lib/reports/shape.ts.
 *
 *   kpi   — one number: query with metrics and NO group_by; optional
 *           compare_query (same shape) for "vs last period".
 *   chart — query with group_by [x] or [x, series] and ≥1 metric.
 *   pivot — query with group_by [row, column] and exactly one metric.
 *   table — any query (plain rows, or a grouped summary).
 */

export const WIDGET_TYPES = ["kpi", "chart", "pivot", "table"] as const;
export const CHART_KINDS = ["bar", "line", "area", "pie", "stacked_bar"] as const;
export const FORMATS = ["money", "number", "percent"] as const;
export const SIZES = ["full", "half"] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];
export type ChartKind = (typeof CHART_KINDS)[number];
export type ValueFormat = (typeof FORMATS)[number];

export type Widget = {
  id: string;
  type: WidgetType;
  title: string;
  /** One line under the title, e.g. what's included. */
  note?: string;
  query: QuerySpec;
  /** KPI only: the comparison period (e.g. last month). */
  compare_query?: QuerySpec;
  compare_label?: string;
  chart?: ChartKind;
  format?: ValueFormat;
  /** Charts / tables / pivots: half-width sits two to a row. */
  size?: (typeof SIZES)[number];
  /** Column key → display label override. */
  labels?: Record<string, string>;
};

export const FREQUENCIES = ["daily", "weekdays", "weekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type Schedule = {
  frequency: Frequency;
  /** "HH:MM", 24h, Central time. */
  time: string;
  /** weekly: 0 = Sunday … 6 = Saturday. */
  weekday?: number;
  /** monthly: 1-28, or "last". */
  monthday?: number | "last";
  recipients: string[];
  attach_excel?: boolean;
};

export type Report = {
  id: string;
  owner_id: string;
  owner_name?: string | null;
  title: string;
  description: string | null;
  widgets: Widget[];
  schedule: Schedule | null;
  schedule_enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  created_at: string;
  updated_at: string;
};

export type WidgetResult =
  | {
      id: string;
      ok: true;
      columns: string[];
      rows: Record<string, unknown>[];
      total: number;
      truncated: boolean;
      /** KPI */
      value?: number | null;
      compare?: number | null;
    }
  | { id: string; ok: false; error: string };
