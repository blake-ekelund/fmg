import type { UserRole } from "@/components/UserContext";
import { runQuery, type QuerySpec } from "@/lib/assistant/dataCatalog";
import { CHART_KINDS, FORMATS, SIZES, WIDGET_TYPES, type Widget, type WidgetResult } from "./types";

/* Server side of custom reports: validate a widget list (from the page or
   Sage) and run it. Every query goes through dataCatalog.runQuery under the
   given role, so a widget over a dataset the role can't see comes back as an
   error tile — never as data. */

export const MAX_WIDGETS = 16;
const TABLE_ROWS = 250;
const GROUP_ROWS = 2000;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function readQuery(raw: unknown): QuerySpec | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.dataset !== "string") return null;
  return {
    dataset: q.dataset,
    columns: Array.isArray(q.columns) ? q.columns.map(String) : undefined,
    filters: Array.isArray(q.filters) ? (q.filters as QuerySpec["filters"]) : undefined,
    group_by: Array.isArray(q.group_by) ? q.group_by.map(String) : undefined,
    metrics: Array.isArray(q.metrics) ? (q.metrics as QuerySpec["metrics"]) : undefined,
    order_by: typeof q.order_by === "string" ? q.order_by : undefined,
    descending: q.descending === true,
    limit: typeof q.limit === "number" ? q.limit : undefined,
  };
}

const newId = () => Math.random().toString(36).slice(2, 10);

/** Validate + clean a widget list. Throws a readable error naming the widget. */
export function normalizeWidgets(raw: unknown): Widget[] {
  if (!Array.isArray(raw)) throw new Error("widgets must be a list.");
  if (raw.length > MAX_WIDGETS) throw new Error(`A report can hold up to ${MAX_WIDGETS} widgets.`);
  const seen = new Set<string>();
  return raw.map((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const title = str(r.title, 120) || `Widget ${i + 1}`;
    const type = r.type as Widget["type"];
    if (!WIDGET_TYPES.includes(type)) throw new Error(`"${title}": type must be one of ${WIDGET_TYPES.join(", ")}.`);
    const query = readQuery(r.query);
    if (!query) throw new Error(`"${title}": needs a query with a dataset.`);
    const groups = query.group_by?.length ?? 0;
    const metrics = query.metrics?.length ?? 0;
    if (type === "kpi" && (groups || !metrics)) throw new Error(`"${title}": a KPI needs metrics and no group_by.`);
    if (type === "chart" && (groups < 1 || groups > 2 || !metrics)) throw new Error(`"${title}": a chart needs group_by [x] or [x, series] and at least one metric.`);
    if (type === "pivot" && (groups !== 2 || metrics !== 1)) throw new Error(`"${title}": a pivot needs group_by [row, column] and exactly one metric.`);
    let id = str(r.id, 40) || newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const w: Widget = { id, type, title, query };
    const note = str(r.note, 240);
    if (note) w.note = note;
    if (type === "kpi") {
      const cq = readQuery(r.compare_query);
      if (cq) {
        if (cq.group_by?.length || !cq.metrics?.length) throw new Error(`"${title}": compare_query needs metrics and no group_by.`);
        w.compare_query = cq;
        w.compare_label = str(r.compare_label, 40) || "vs prior period";
      }
    }
    if (type === "chart") w.chart = CHART_KINDS.includes(r.chart as never) ? (r.chart as Widget["chart"]) : "bar";
    if (FORMATS.includes(r.format as never)) w.format = r.format as Widget["format"];
    if (type !== "kpi") w.size = SIZES.includes(r.size as never) ? (r.size as Widget["size"]) : type === "chart" ? "half" : "full";
    if (r.labels && typeof r.labels === "object") {
      w.labels = Object.fromEntries(
        Object.entries(r.labels as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string" && v.trim())
          .slice(0, 20)
          .map(([k, v]) => [k.slice(0, 80), String(v).trim().slice(0, 60)]),
      );
    }
    return w;
  });
}

function firstMetric(rows: Record<string, unknown>[], q: QuerySpec): number | null {
  const m = q.metrics?.[0];
  if (!m || !rows[0]) return null;
  const v = rows[0][m.column ? `${m.fn}_${m.column}` : m.fn];
  return typeof v === "number" ? v : v == null ? null : Number(v);
}

export async function runWidget(w: Widget, role: UserRole, maxTableRows = TABLE_ROWS): Promise<WidgetResult> {
  try {
    const grouped = !!(w.query.group_by?.length || w.query.metrics?.length);
    const max = grouped ? GROUP_ROWS : maxTableRows;
    const r = await runQuery({ ...w.query, limit: Math.min(w.query.limit ?? max, max) }, role, { maxRows: max, scanLimit: 200_000 });
    const out: WidgetResult = { id: w.id, ok: true, columns: r.columns, rows: r.rows, total: r.total, truncated: r.truncated };
    if (w.type === "kpi") {
      out.value = firstMetric(r.rows, w.query);
      if (w.compare_query) {
        const c = await runQuery({ ...w.compare_query, limit: 1 }, role, { maxRows: 1, scanLimit: 200_000 });
        out.compare = firstMetric(c.rows, w.compare_query);
      }
      out.rows = [];
    }
    return out;
  } catch (e) {
    return { id: w.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Run every widget (in parallel, a few at a time). */
export async function runReport(widgets: Widget[], role: UserRole, maxTableRows = TABLE_ROWS): Promise<WidgetResult[]> {
  const out: WidgetResult[] = new Array(widgets.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, widgets.length) }, async () => {
      while (next < widgets.length) {
        const i = next++;
        out[i] = await runWidget(widgets[i], role, maxTableRows);
      }
    }),
  );
  return out;
}
