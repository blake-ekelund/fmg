import type Anthropic from "@anthropic-ai/sdk";
import type { UserRole } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { supabaseServer } from "@/lib/supabaseServer";
import { TOOL_DEFS as DATA_TOOL_DEFS, runTool as runDataTool } from "./tools";
import { FILTER_OPS, METRIC_FNS, datasetsForRole, describeDatasets, runQuery, type QuerySpec } from "./dataCatalog";
import { searchConversations } from "./sageMemory";
import { exportFilename, probeExport, readExportSpec, type ExportSpec } from "./reportExport";
import { JE_COLUMNS, JE_COLUMN_LABELS, type SavedSettlement } from "@/lib/amazonSettlement";
import { normalizeWidgets, runReport } from "@/lib/reports/run";
import { describeSchedule } from "@/lib/reports/schedule";
import { canEdit, createReport, getReport, listReports, resolveRecipients, updateReport, type ReportInput } from "@/lib/reports/store";
import { houseRulesText, lintWidgets } from "@/lib/reports/rules";
import { CHART_KINDS, FORMATS, FREQUENCIES, WIDGET_TYPES, type Widget } from "@/lib/reports/types";

/**
 * What Sage (the in-app assistant) can DO, beyond explaining the site.
 *
 * The rule: Sage creates DRAFTS and looks things up. It never sends, publishes,
 * schedules, deletes or pushes anything — every create here lands as a draft
 * the user opens, checks and ships themselves. That keeps every action
 * reversible without needing a confirm step in the chat. (Importing an Amazon
 * settlement saves a journal entry, but it's derived from the user's own file,
 * internal-only, and deletable on the page.)
 *
 * Each tool is gated on a page: it's only offered when the user's role can open
 * that page (getAllowedPaths), so Sage can't do anything the user couldn't do
 * by hand. Creates that have an API route call it server-to-server with the
 * user's own token, so they run through exactly the same validation and
 * permission checks as the UI; the rest mirror what the page writes.
 */

export type ToolContext = {
  role: UserRole;
  userId: string;
  /** Origin of the incoming request, for server-to-server calls to our own routes. */
  origin: string;
  /** The user's "Bearer …" header, forwarded so self-calls act as them. */
  authorization: string;
  /** The saved conversation this turn belongs to (excluded from recall). */
  conversationId?: string | null;
  /** Text files the user attached in this chat (resent each turn by the widget). */
  attachments?: { name: string; text: string }[];
};

/** Something Sage made — shown in the chat as a button to open it. */
export type ToolAction =
  | { label: string; href: string }
  /** A report: the widget posts `spec` to /api/help/export and saves the file. */
  | { label: string; download: { spec: ExportSpec; filename: string } }
  /** Schedule / publish — runs only when the user clicks "Yes, …" on the card. */
  | { label: string; confirm: PublishConfirm };

export type PublishConfirm = {
  kind: "social" | "blog";
  id: string;
  mode: "schedule" | "publish_now";
  /** ISO time for a schedule. */
  when: string | null;
  title: string;
  /** e.g. "NI · Instagram + Facebook". */
  detail: string;
  /** Set by the widget once the user acts. */
  state?: "done" | "cancelled";
  result?: string;
};

type ToolResult = { result: unknown; action?: ToolAction };

type HelpTool = {
  def: Anthropic.Tool;
  /** Page the user must be able to open for this tool to be offered ("*" = any staff). */
  page: string;
  /** Shown in the chat while it runs, e.g. "Writing the email…". */
  status: string;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function callApi<T>(ctx: ToolContext, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(new URL(path, ctx.origin), {
    method,
    headers: { "Content-Type": "application/json", Authorization: ctx.authorization },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? `${path} failed (${res.status}).`);
  return json;
}

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const pickMany = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : [];

/* ------------------------------------------------------------------ */
/* Create tools                                                       */
/* ------------------------------------------------------------------ */

const TEMPLATE_PURPOSES = ["newsletter", "winback", "promotion", "product_launch", "welcome", "announcement", "other"] as const;

const createEmailTemplate: HelpTool = {
  page: "/templates",
  status: "Writing the email template…",
  def: {
    name: "create_email_template",
    description:
      "Create a new designed email template (a DRAFT on the Email Templates page) written by AI from a brief — same as the page's 'Generate with AI' option. Nothing is sent. Use when the user asks you to make/draft/create an email or template. Takes up to a minute.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template title shown in the library, e.g. 'NI Holiday Gift Guide 2026'." },
        brief: {
          type: "string",
          description:
            "What the email should say and include: goal, offer/discount, products, tone, call-to-action, hero idea. Be specific — pass along everything the user told you.",
        },
        brand: { type: "string", enum: ["ni", "sassy", "both"], description: "Natural Inspirations, Sassy, or both." },
        audience: { type: "string", enum: ["wholesale", "d2c", "both"], description: "Wholesale retailers, direct-to-consumer shoppers, or both." },
        purposes: { type: "array", items: { type: "string", enum: [...TEMPLATE_PURPOSES] } },
      },
      required: ["name", "brief", "brand", "audience"],
    },
  },
  async run(input, ctx) {
    const brand = pick(input.brand, ["ni", "sassy", "both"] as const, "both");
    const channel = pick(input.audience, ["wholesale", "d2c", "both"] as const, "both");
    const purpose = pickMany(input.purposes, TEMPLATE_PURPOSES);
    const name = str(input.name, 120) || "Untitled Template";
    const gen = await callApi<{ subject: string; preview_text: string; blocks: unknown[] }>(ctx, "POST", "/api/email/generate", {
      brand,
      channel,
      purpose,
      prompt: str(input.brief),
      name,
    });
    // Same row the editor's first autosave writes for a wizard-made template.
    const { data, error } = await supabaseServer
      .from("email_templates")
      .insert({
        name,
        subject: gen.subject,
        type: "email",
        brand,
        channel,
        source: "blocks",
        blocks: gen.blocks,
        raw_html: null,
        text_body: null,
        sms_body: "",
        preview_text: gen.preview_text,
        from_name: "",
        purpose,
        description: "Drafted by Sage",
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't save the template.");
    return {
      result: { created: true, id: data.id, name, subject: gen.subject, preview_text: gen.preview_text, blocks: gen.blocks.length, link: `/templates?edit=${data.id}` },
      action: { label: `Open “${name}”`, href: `/templates?edit=${data.id}` },
    };
  },
};

const createTask: HelpTool = {
  page: "/task-list",
  status: "Adding the task…",
  def: {
    name: "create_task",
    description:
      "Add a task to the Task List. Use when the user asks you to add/create a task, to-do or reminder. If they name an owner, pass their first name; the tool checks it against the team.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short task title." },
        description: { type: "string" },
        owner: { type: "string", description: "Team member's first name, e.g. 'Julie'. Omit if not given." },
        priority: { type: "string", enum: ["High", "Medium", "Low"] },
        due_date: { type: "string", description: "YYYY-MM-DD. Resolve relative dates ('Friday') using today's date." },
      },
      required: ["name"],
    },
  },
  async run(input) {
    const name = str(input.name, 200);
    if (!name) throw new Error("A task needs a name.");
    let owner: string | null = null;
    const wanted = str(input.owner, 80);
    if (wanted) {
      // Owners are stored as staff first names (see lib/team-owners.ts).
      const { data } = await supabaseServer.from("profiles").select("first_name, access");
      const names = [...new Set(
        ((data ?? []) as { first_name: string | null; access: string | null }[])
          .filter((r) => r.access && r.access !== "rep" && r.first_name?.trim())
          .map((r) => r.first_name!.trim()),
      )];
      owner = names.find((n) => n.toLowerCase() === wanted.toLowerCase()) ?? null;
      if (!owner) return { result: { created: false, error: `No team member named "${wanted}".`, team: names } };
    }
    const due = str(input.due_date, 10);
    const { data, error } = await supabaseServer
      .from("tasks")
      .insert({
        name,
        description: str(input.description, 2000) || null,
        owner,
        priority: pick(input.priority, ["High", "Medium", "Low"] as const, "Medium"),
        status: "todo",
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
        completed: false,
        notes: null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't add the task.");
    return { result: { created: true, id: data.id, name, owner, link: "/task-list" }, action: { label: "Open Task List", href: "/task-list" } };
  },
};

const SOCIAL_PURPOSES = ["education", "product", "launch", "community", "seasonal", "promo"] as const;

const createSocialPost: HelpTool = {
  page: "/marketing/social",
  status: "Writing the social post…",
  def: {
    name: "create_social_post",
    description:
      "Create a social media post DRAFT (Instagram/Facebook) written and designed by AI — same as 'New post' with AI on the Social Media page. Nothing is posted or scheduled. Takes up to a minute.",
    input_schema: {
      type: "object",
      properties: {
        brand: { type: "string", enum: ["Sassy", "NI"] },
        brief: { type: "string", description: "What the post is about — product, message, offer, tone. Pass along everything the user said." },
        purpose: { type: "string", enum: [...SOCIAL_PURPOSES] },
        platforms: { type: "array", items: { type: "string", enum: ["instagram", "facebook"] } },
        format: { type: "string", enum: ["carousel", "single"], description: "Carousel (several slides) or a single image. Default carousel." },
        slide_count: { type: "integer", description: "Slides for a carousel, 3–8. Default 5." },
      },
      required: ["brand", "brief"],
    },
  },
  async run(input, ctx) {
    const brand = pick(input.brand, ["Sassy", "NI"] as const, "NI");
    const platforms = pickMany(input.platforms, ["instagram", "facebook"] as const);
    const plats = platforms.length ? platforms : ["instagram", "facebook"];
    const gen = await callApi<{ title: string; design: unknown; scheduleSuggestion?: string | null }>(ctx, "POST", "/api/social/generate", {
      brand,
      purpose: pick(input.purpose, SOCIAL_PURPOSES, "education"),
      platforms: plats,
      format: input.format === "single" ? "single" : "carousel",
      slideCount: Math.min(8, Math.max(3, Math.round(Number(input.slide_count) || 5))),
      prompt: str(input.brief, 3000),
      parts: [],
    });
    const { post } = await callApi<{ post: { id: string; title?: string | null } }>(ctx, "POST", "/api/social/posts", {
      brand,
      platforms: plats,
      title: gen.title,
      design: gen.design,
    });
    const title = post.title ?? gen.title;
    return {
      result: { created: true, id: post.id, title, status: "draft", link: `/marketing/social/${post.id}` },
      action: { label: `Open “${title || "social post"}”`, href: `/marketing/social/${post.id}` },
    };
  },
};

const BLOG_PURPOSES = ["product_spotlight", "ingredient_story", "ritual_howto", "seasonal_gift", "new_arrival", "brand_story", "news", "other"] as const;

const createBlogPost: HelpTool = {
  page: "/marketing/blog",
  status: "Writing the blog post…",
  def: {
    name: "create_blog_post",
    description:
      "Create a blog post DRAFT written by AI in the brand's format — same as the Blog Posts wizard's AI option. Nothing is published. Takes up to a minute or two.",
    input_schema: {
      type: "object",
      properties: {
        brand: { type: "string", enum: ["Sassy", "NI"] },
        title: { type: "string" },
        brief: { type: "string", description: "What the article should cover. Pass along everything the user said." },
        audience: { type: "string", enum: ["d2c", "wholesale", "both"], description: "d2c = shoppers reading the storefront blog. Default d2c." },
        purpose: { type: "string", enum: [...BLOG_PURPOSES] },
      },
      required: ["brand", "title", "brief"],
    },
  },
  async run(input, ctx) {
    const base = {
      brand: pick(input.brand, ["Sassy", "NI"] as const, "NI"),
      title: str(input.title, 200),
      audience: pick(input.audience, ["d2c", "wholesale", "both"] as const, "d2c"),
      purpose: pick(input.purpose, BLOG_PURPOSES, "other"),
      description: "",
    };
    const gen = await callApi<{ blocks: unknown[]; seo_meta: string; tags: string[]; hero_image_url: string }>(
      ctx,
      "POST",
      "/api/marketing/blog/generate",
      { ...base, prompt: str(input.brief) },
    );
    const { post } = await callApi<{ post: { id: string } }>(ctx, "POST", "/api/marketing/blog", {
      ...base,
      blocks: gen.blocks,
      seo_meta: gen.seo_meta,
      tags: gen.tags,
      hero_image_url: gen.hero_image_url,
    });
    return {
      result: { created: true, id: post.id, title: base.title, status: "draft", link: `/marketing/blog/${post.id}` },
      action: { label: `Open “${base.title}”`, href: `/marketing/blog/${post.id}` },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Read-only data lookups (shared with the Slack assistant)           */
/* ------------------------------------------------------------------ */

const DATA_PAGES: Record<string, string> = {
  get_inventory: "/inventory",
  sales_summary: "/sales",
  customer_lookup: "/customers",
  list_sales_reps: "/sales-team",
};

const DATA_STATUS: Record<string, string> = {
  get_inventory: "Checking inventory…",
  sales_summary: "Pulling sales numbers…",
  customer_lookup: "Looking up the customer…",
  list_sales_reps: "Checking the rep directory…",
};

const dataTools: HelpTool[] = DATA_TOOL_DEFS.map((d) => ({
  def: { name: d.name, description: d.description, input_schema: d.input_schema },
  page: DATA_PAGES[d.name] ?? "/dashboard",
  status: DATA_STATUS[d.name] ?? "Looking that up…",
  run: async (input) => ({ result: await runDataTool(d.name, input) }),
}));

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Reports over the data catalog (lib/assistant/dataCatalog.ts)       */
/* ------------------------------------------------------------------ */

function querySchema(datasets: string[], extra: Record<string, unknown> = {}): Anthropic.Tool.InputSchema {
  return {
    type: "object",
    properties: {
      dataset: { type: "string", enum: datasets },
      columns: { type: "array", items: { type: "string" }, description: "Columns to return (plain queries). Omit for all." },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            column: { type: "string" },
            op: { type: "string", enum: [...FILTER_OPS], description: "contains = case-insensitive text match; in takes an array" },
            value: {
              description:
                "Dates as YYYY-MM-DD, or a relative date that resolves at run time: @today, @yesterday, @start_of_week (Monday), @start_of_month, @start_of_quarter, @start_of_year, each with an optional offset like -7d, -1m, -1y (e.g. @start_of_month-1m = first of last month; last month = gte @start_of_month-1m AND lt @start_of_month). Use relative dates in saved reports so they stay current. Omit for is_null / not_null.",
            },
          },
          required: ["column", "op"],
        },
      },
      group_by: {
        type: "array",
        items: { type: "string" },
        description:
          "Group rows by these columns (e.g. month, brand) to build a summary. A date/timestamp column can be bucketed with a suffix: \"created_at:day|week|month|quarter|year\" (the value is the period's first day; that string is also the output column name).",
      },
      metrics: {
        type: "array",
        items: {
          type: "object",
          properties: { fn: { type: "string", enum: [...METRIC_FNS] }, column: { type: "string" } },
          required: ["fn"],
        },
        description: "Aggregates per group, e.g. [{fn:\"sum\",column:\"revenue\"}]. Output columns are named fn_column (or \"count\").",
      },
      order_by: { type: "string", description: "A column, or a metric output name like sum_revenue." },
      descending: { type: "boolean" },
      limit: { type: "integer" },
      ...extra,
    },
    required: ["dataset"],
  };
}

function readSpec(input: Record<string, unknown>): QuerySpec {
  return {
    dataset: str(input.dataset, 60),
    columns: Array.isArray(input.columns) ? input.columns.map(String) : undefined,
    filters: Array.isArray(input.filters) ? (input.filters as QuerySpec["filters"]) : undefined,
    group_by: Array.isArray(input.group_by) ? input.group_by.map(String) : undefined,
    metrics: Array.isArray(input.metrics) ? (input.metrics as QuerySpec["metrics"]) : undefined,
    order_by: typeof input.order_by === "string" ? input.order_by : undefined,
    descending: input.descending === true,
    limit: typeof input.limit === "number" ? input.limit : undefined,
  };
}

/** Trim long text so a result set stays readable for the model. */
function compact(rows: Record<string, unknown>[]) {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        typeof v === "string" && v.length > 160
          ? v.slice(0, 160) + "…"
          : v && typeof v === "object"
            ? JSON.stringify(v).slice(0, 200)
            : v,
      ]),
    ),
  );
}

function reportTools(role: UserRole): HelpTool[] {
  const datasets = datasetsForRole(role);
  if (!datasets.length) return [];
  return [
    {
      page: "*",
      status: "Pulling the data…",
      def: {
        name: "query_data",
        description: `Read any data this user can see in the portal and answer from it: list/filter rows, or summarize with group_by + metrics (sums, counts, averages). Use for questions about orders, customers, inventory, products, sales, tasks, emails, discounts, posts, reps — anything in the catalog. Returns up to 100 rows plus the total match count. Report numbers exactly as returned; say when results are truncated.

Datasets:
${describeDatasets(datasets)}`,
        input_schema: querySchema(datasets),
      },
      async run(input) {
        const r = await runQuery(readSpec(input), role, { maxRows: 100 });
        return { result: { ...r, rows: compact(r.rows) } };
      },
    },
    {
      page: "*",
      status: "Building the report…",
      def: {
        name: "export_report",
        description:
          "Make a downloadable Excel workbook (.xlsx) — one tab per sheet, up to 12 tabs and 20,000 rows each. Use when the user asks to export, download, pull a report, or wants a spreadsheet. Each sheet is either a `query` (same shape as query_data: dataset, filters, columns, group_by, metrics, order_by…) or a small `table` you assemble from numbers you already pulled (e.g. a Summary tab of regional totals). Split by segment = one sheet per segment with its own filters (e.g. a tab per region using an `in` filter on state). Only use format csv if they ask for CSV (single sheet). The result gives each sheet's row count — if any sheet has 0 rows, fix the filter and call again before telling the user it's ready. The app shows a Download button.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short report name, used as the file name." },
            format: { type: "string", enum: ["xlsx", "csv"] },
            sheets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Tab name (≤31 chars)." },
                  query: querySchema(datasets),
                  table: {
                    type: "object",
                    properties: {
                      columns: { type: "array", items: { type: "string" } },
                      rows: { type: "array", items: { type: "array", items: {} } },
                    },
                    required: ["columns", "rows"],
                  },
                },
                required: ["name"],
              },
            },
          },
          required: ["title", "sheets"],
        },
      },
      async run(input) {
        const spec = readExportSpec(input, str(input.title, 80) || "Report");
        // Validate (and count) every sheet now so a bad or empty one fails in the chat, not on click.
        const sheets = await probeExport(spec, role);
        const empty = sheets.filter((s) => s.rows === 0).map((s) => s.sheet);
        const kind = spec.format === "csv" ? "CSV" : "Excel";
        return {
          result: {
            ready: empty.length === 0,
            title: spec.title,
            format: spec.format,
            sheets,
            row_cap_per_sheet: 20000,
            ...(empty.length
              ? { warning: `Empty sheet(s): ${empty.join(", ")}. Check the filter values (states are full names like "Minnesota"), then call export_report again.` }
              : {}),
          },
          ...(empty.length === spec.sheets.length
            ? {}
            : { action: { label: `Download “${spec.title}” (${kind})`, download: { spec, filename: exportFilename(spec) } } }),
        };
      },
    },
    ...customReportTools(datasets),
  ];
}

/* ------------------------------------------------------------------ */
/* Custom reports (the Reports page — lib/reports)                    */
/* ------------------------------------------------------------------ */

export function widgetSchema(datasets: string[]): Anthropic.Tool.InputSchema {
  return {
    type: "object",
    properties: {
      id: { type: "string", description: "Keep an existing widget's id when editing a report; omit for new widgets." },
      type: {
        type: "string",
        enum: [...WIDGET_TYPES],
        description:
          "kpi = one big number (query with metrics, NO group_by); chart = group_by [x] or [x, series] + ≥1 metric; pivot = group_by [row, column] + exactly one metric (a cross-tab with totals); table = rows or a grouped summary.",
      },
      title: { type: "string", description: "Short, plain title, e.g. 'Revenue this month'." },
      note: { type: "string", description: "Optional one line under the title (what's included)." },
      query: querySchema(datasets),
      compare_query: { ...querySchema(datasets), description: "KPI only: same metric over the comparison period (e.g. last month) — shows ▲/▼ %." },
      compare_label: { type: "string", description: "KPI only, e.g. 'vs last month'." },
      chart: { type: "string", enum: [...CHART_KINDS], description: "Chart only. line/area for trends over time, bar for comparing categories, stacked_bar for a total split by series, pie for share of a whole (≤8 slices)." },
      format: { type: "string", enum: [...FORMATS], description: "Value format; defaults to money for revenue-like metrics." },
      size: { type: "string", enum: ["full", "half"], description: "Charts default half (two per row), tables/pivots full." },
      labels: { type: "object", description: "Optional column → display label, e.g. {\"sum_revenue\":\"Revenue\"}." },
    },
    required: ["type", "title", "query"],
  };
}

const SCHEDULE_SCHEMA = {
  type: ["object", "null"],
  description: "Email delivery. null removes the schedule. Times are Central and snap to the quarter hour.",
  properties: {
    frequency: { type: "string", enum: [...FREQUENCIES] },
    time: { type: "string", description: "HH:MM 24-hour Central, e.g. 07:30." },
    weekday: { type: "integer", description: "weekly: 0 Sunday … 6 Saturday (1 = Monday)." },
    monthday: { description: "monthly: 1-28 or \"last\"." },
    recipients: {
      type: "array",
      items: { type: "string" },
      description: "FMG team members only: emails, first names, or \"me\" for the person you're talking to.",
    },
    attach_excel: { type: "boolean", description: "Attach the full numbers as Excel (default true)." },
  },
  required: ["frequency", "time", "recipients"],
} as const;

/** Run each widget once so a bad filter or empty result surfaces in the chat, not on the page. */
async function probeWidgets(widgets: Widget[], role: UserRole) {
  const results = await runReport(widgets, role, 5);
  return widgets.map((w, i) => {
    const r = results[i];
    if (!r.ok) return { id: w.id, title: w.title, error: r.error };
    return {
      id: w.id,
      title: w.title,
      ...(w.type === "kpi" ? { value: r.value, compare: r.compare } : { rows: r.rows.length, matching_rows: r.total }),
    };
  });
}

/**
 * Probe + the report rules (lib/reports/rules.ts). Rule errors and failing
 * widgets block the save; rule warnings go back to Sage to fix or justify.
 */
async function checkWidgets(widgets: Widget[], role: UserRole) {
  const lint = lintWidgets(widgets);
  const probe = await probeWidgets(widgets, role);
  const problems = [
    ...probe.filter((p) => "error" in p),
    ...lint.filter((l) => l.level === "error").map((l) => ({ title: l.widget, error: `[${l.rule}] ${l.message}` })),
  ];
  const warnings = lint.filter((l) => l.level === "warning").map((l) => `${l.widget}: ${l.message}`);
  return { probe, problems, warnings };
}

const WARNING_HINT =
  "Saved, but these break the report rules. Fix them with update_report now — the rules come from the business, not the user. Don't list the rules to the user.";

async function scheduleInput(input: Record<string, unknown>, ctx: ToolContext) {
  if (input.schedule === undefined) return {};
  if (input.schedule === null) return { schedule: null };
  const s = input.schedule as Record<string, unknown>;
  return { schedule: { ...s, recipients: await resolveRecipients(s.recipients, ctx.userId) }, schedule_enabled: true };
}

function customReportTools(datasets: string[]): HelpTool[] {
  const reportAction = (id: string, title: string): ToolAction => ({
    label: `Open report “${title}”`,
    // A fresh query string so the page reloads when Sage edits the report you're on.
    href: `/reports/${id}?v=${Date.now().toString(36)}`,
  });
  return [
    {
      page: "/reports",
      status: "Building the report…",
      def: {
        name: "create_report",
        description: `Create a saved custom report on the Reports page — a live dashboard of KPI tiles, charts, pivot tables and tables that re-runs on every view — optionally emailed on a schedule (daily, weekdays, weekly, monthly at a set time) to FMG team members. Use when the user wants a report/dashboard they'll come back to or receive regularly (a one-off spreadsheet is export_report). Every widget is run first; if any errors or returns nothing, nothing is saved and you get the problems back to fix. Use relative dates (@start_of_month…) so it stays current. Typical shape: 2-4 KPIs on top (with compare_query vs the prior period), a trend chart (group_by "<date>:month" or ":week"), a breakdown (pivot or bar chart by brand / channel / product), then a detail table.

REPORT RULES — set by the business; follow every one, even if the user asks otherwise (some are checked: breaking a checked rule blocks the save or comes back as a warning). The app formats every value and label and colours every chart itself, so never put formatting in titles or labels.
${houseRulesText()}`,
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string", description: "One sentence: what it's for." },
            widgets: { type: "array", items: widgetSchema(datasets) },
            schedule: SCHEDULE_SCHEMA as unknown as Record<string, unknown>,
          },
          required: ["title", "widgets"],
        },
      },
      async run(input, ctx) {
        const widgets = normalizeWidgets(input.widgets);
        const { probe, problems, warnings } = await checkWidgets(widgets, ctx.role);
        if (problems.length) return { result: { saved: false, problems, hint: "Fix these widgets and call create_report again." } };
        const report = await createReport(ctx.userId, {
          title: input.title,
          description: input.description,
          widgets,
          ...(await scheduleInput(input, ctx)),
        });
        return {
          result: {
            saved: true,
            id: report.id,
            title: report.title,
            widgets: probe,
            schedule: report.schedule ? `${describeSchedule(report.schedule)} to ${report.schedule.recipients.join(", ")}` : "none",
            next_send: report.next_run_at,
            ...(warnings.length ? { rule_warnings: warnings, hint: WARNING_HINT } : {}),
          },
          action: reportAction(report.id, report.title),
        };
      },
    },
    {
      page: "/reports",
      status: "Updating the report…",
      def: {
        name: "update_report",
        description:
          "Change a saved report: rename it, replace its widget list (send the FULL list — keep existing widgets' ids and definitions, add/remove/reorder/edit as asked; get them first with find_reports), or set / change / remove (null) its email schedule, or pause/resume it (schedule_enabled). Widgets are re-checked before saving.",
        input_schema: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            widgets: { type: "array", items: widgetSchema(datasets) },
            schedule: SCHEDULE_SCHEMA as unknown as Record<string, unknown>,
            schedule_enabled: { type: "boolean", description: "false pauses the emails, true resumes them." },
          },
          required: ["id"],
        },
      },
      async run(input, ctx) {
        const existing = await getReport(str(input.id, 60));
        if (!existing) return { result: { updated: false, error: "No report with that id — use find_reports." } };
        if (!canEdit(existing, { id: ctx.userId, access: ctx.role })) {
          return { result: { updated: false, error: "Only the report's creator or an admin can change it." } };
        }
        const patch: ReportInput = { ...(await scheduleInput(input, ctx)) };
        if (input.title !== undefined) patch.title = input.title;
        if (input.description !== undefined) patch.description = input.description;
        if (typeof input.schedule_enabled === "boolean") patch.schedule_enabled = input.schedule_enabled;
        let probe: Awaited<ReturnType<typeof probeWidgets>> | undefined;
        let warnings: string[] = [];
        if (input.widgets !== undefined) {
          const widgets = normalizeWidgets(input.widgets);
          const checked = await checkWidgets(widgets, ctx.role);
          if (checked.problems.length) {
            return { result: { updated: false, problems: checked.problems, hint: "Fix these widgets and call update_report again." } };
          }
          probe = checked.probe;
          warnings = checked.warnings;
          patch.widgets = widgets;
        }
        const report = await updateReport(existing, patch);
        return {
          result: {
            updated: true,
            id: report.id,
            title: report.title,
            widgets: probe ?? report.widgets.map((w) => ({ id: w.id, title: w.title, type: w.type })),
            schedule: report.schedule
              ? `${describeSchedule(report.schedule)} to ${report.schedule.recipients.join(", ")}${report.schedule_enabled ? "" : " (paused)"}`
              : "none",
            next_send: report.next_run_at,
            ...(warnings.length ? { rule_warnings: warnings, hint: WARNING_HINT } : {}),
          },
          action: reportAction(report.id, report.title),
        };
      },
    },
    {
      page: "/reports",
      status: "Looking at your reports…",
      def: {
        name: "find_reports",
        description:
          "List saved custom reports (title, owner, schedule, widget titles), or with an id return one report's full definition (every widget's query) — do this before update_report. Also use when the user refers to 'my report' / 'the weekly sales report'.",
        input_schema: {
          type: "object",
          properties: { id: { type: "string" }, search: { type: "string", description: "Words in the title." } },
        },
      },
      async run(input) {
        const id = str(input.id, 60);
        if (id) {
          const r = await getReport(id);
          if (!r) return { result: { error: "No report with that id." } };
          return {
            result: {
              ...r,
              schedule_text: r.schedule ? describeSchedule(r.schedule) : null,
            },
          };
        }
        const { ready, items } = await listReports();
        if (!ready) return { result: { error: "Reports aren't switched on yet (database migration pending) — ask Blake." } };
        const words = str(input.search, 80).toLowerCase().split(/\s+/).filter(Boolean);
        return {
          result: items
            .filter((r) => words.every((w) => r.title.toLowerCase().includes(w)))
            .slice(0, 30)
            .map((r) => ({
              id: r.id,
              title: r.title,
              owner: r.owner_name,
              widgets: r.widgets.map((w) => `${w.title} (${w.type})`),
              schedule: r.schedule ? `${describeSchedule(r.schedule)}${r.schedule_enabled ? "" : " — paused"}` : null,
              updated_at: r.updated_at,
            })),
        };
      },
    },
  ];
}

async function teamFirstNames(): Promise<string[]> {
  const { data } = await supabaseServer.from("profiles").select("first_name, access");
  return [
    ...new Set(
      ((data ?? []) as { first_name: string | null; access: string | null }[])
        .filter((r) => r.access && r.access !== "rep" && r.first_name?.trim())
        .map((r) => r.first_name!.trim()),
    ),
  ];
}

const updateTask: HelpTool = {
  page: "/task-list",
  status: "Updating the task…",
  def: {
    name: "update_task",
    description:
      "Change a task on the Task List: mark it done / in progress, reassign it, change priority or due date, or set notes. Find its id with query_data on the tasks dataset first. Never deletes.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        owner: { type: "string", description: "Team member's first name" },
        priority: { type: "string", enum: ["High", "Medium", "Low"] },
        due_date: { type: "string", description: "YYYY-MM-DD, or empty to clear" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  async run(input) {
    const id = str(input.id, 60);
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      patch.status = pick(input.status, ["todo", "in_progress", "done"] as const, "todo");
      patch.completed = patch.status === "done";
    }
    if (input.priority !== undefined) patch.priority = pick(input.priority, ["High", "Medium", "Low"] as const, "Medium");
    if (input.due_date !== undefined) {
      const due = str(input.due_date, 10);
      patch.due_date = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null;
    }
    if (input.notes !== undefined) patch.notes = str(input.notes, 2000) || null;
    if (input.owner !== undefined) {
      const wanted = str(input.owner, 80);
      const names = await teamFirstNames();
      const owner = names.find((n) => n.toLowerCase() === wanted.toLowerCase());
      if (wanted && !owner) return { result: { updated: false, error: `No team member named "${wanted}".`, team: names } };
      patch.owner = owner ?? null;
    }
    if (!Object.keys(patch).length) return { result: { updated: false, error: "Nothing to change." } };
    const { data, error } = await supabaseServer.from("tasks").update(patch).eq("id", id).select("id, name").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { result: { updated: false, error: "No task with that id." } };
    return { result: { updated: true, task: data, changes: patch }, action: { label: "Open Task List", href: "/task-list" } };
  },
};

const recallConversations: HelpTool = {
  page: "*",
  status: "Checking our past conversations…",
  def: {
    name: "recall_conversations",
    description:
      "Search this user's past conversations with you (Sage). Use when they refer to something from before (\"what did we decide…\", \"the email you made last week\", \"like last time\") or when earlier context would clearly help. Only their own chats. Pass a few key words; an empty query returns the most recent chats.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Key words, e.g. 'holiday email NI'." } },
    },
  },
  async run(input, ctx) {
    const r = await searchConversations(ctx.userId, str(input.query, 200), ctx.conversationId);
    if (!r.ready) return { result: { error: "Conversation history isn't switched on yet." } };
    return { result: r.matches.length ? r : { matches: [], note: "No past conversations matched." } };
  },
};

/**
 * Scheduling and publishing go out under the user's own click, never Sage's:
 * this tool only checks the post and returns a confirmation card. The widget
 * runs the schedule/publish (the same API routes the Social / Blog pages use,
 * with the user's token) when they press "Yes, …".
 */
const SOCIAL_EDITABLE = new Set(["draft", "scheduled", "failed"]);
const BLOG_SCHEDULABLE = new Set(["ai_draft", "human_review", "ready", "draft", "scheduled"]);

const proposePublishing: HelpTool = {
  page: "*",
  status: "Getting that ready for your OK…",
  def: {
    name: "propose_publishing",
    description:
      "Ask the user to confirm scheduling or publishing a social post or blog post. This does NOT schedule or publish anything — it shows a confirmation card with a 'Yes, schedule' / 'Yes, post now' button the user must click. Use when they ask to schedule, publish, or post something. Find the post's id first (query_data on social_posts / blog_posts, or the draft you just created). For schedule, pass `when` as an ISO date-time with the Central-time offset (e.g. 2026-10-23T09:00:00-05:00). After calling it, tell them in one line to confirm with the button.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["social", "blog"] },
        id: { type: "string" },
        mode: { type: "string", enum: ["schedule", "publish_now"] },
        when: { type: "string", description: "Required for schedule: ISO 8601 date-time with offset, in the future." },
      },
      required: ["kind", "id", "mode"],
    },
  },
  async run(input, ctx) {
    const kind = input.kind === "blog" ? "blog" : "social";
    const mode = input.mode === "publish_now" ? "publish_now" : "schedule";
    const page = kind === "blog" ? "/marketing/blog" : "/marketing/social";
    if (!getAllowedPaths(ctx.role).some((p) => page === p || page.startsWith(p + "/"))) {
      return { result: { error: `This account can't manage ${kind === "blog" ? "blog posts" : "social posts"}.` } };
    }
    const id = str(input.id, 60);
    let when: string | null = null;
    if (mode === "schedule") {
      const t = Date.parse(str(input.when, 40));
      if (!Number.isFinite(t)) return { result: { error: "Pass `when` as an ISO date-time to schedule." } };
      if (t < Date.now() + 60_000) return { result: { error: "That time is in the past — pick a future time, or use publish_now." } };
      when = new Date(t).toISOString();
    }

    let title = "";
    let detail = "";
    if (kind === "social") {
      const { data } = await supabaseServer.from("social_posts").select("id, title, caption, brand, platforms, status").eq("id", id).maybeSingle();
      const post = data as { title?: string | null; caption?: string; brand: string; platforms: string[]; status: string } | null;
      if (!post) return { result: { error: "No social post with that id." } };
      if (!SOCIAL_EDITABLE.has(post.status)) return { result: { error: `That post is already ${post.status}.` } };
      title = (post.title || post.caption || "Social post").replace(/\s+/g, " ").slice(0, 80);
      detail = `${post.brand} · ${post.platforms.map((p) => (p === "instagram" ? "Instagram" : "Facebook")).join(" + ")}`;
    } else {
      const { data } = await supabaseServer.from("blog_posts").select("id, title, brand, status").eq("id", id).maybeSingle();
      const post = data as { title: string; brand: string; status: string } | null;
      if (!post || post.status === "deleted") return { result: { error: "No blog post with that id." } };
      if (post.status === "published") return { result: { error: "That blog post is already published." } };
      if (mode === "schedule" && !BLOG_SCHEDULABLE.has(post.status)) return { result: { error: `A ${post.status} post can't be scheduled.` } };
      title = post.title;
      detail = `${post.brand} blog`;
    }

    const verb = mode === "schedule" ? "Schedule" : kind === "blog" ? "Publish" : "Post";
    return {
      result: { awaiting_user_confirmation: true, kind, id, mode, when, title },
      action: {
        label: `${verb} “${title}”`,
        confirm: { kind, id, mode, when, title, detail },
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Accounting                                                         */
/* ------------------------------------------------------------------ */

const importAmazonSettlement: HelpTool = {
  page: "/accounting/amazon-payments",
  status: "Building the journal entry…",
  def: {
    name: "import_amazon_settlement",
    description:
      "Turn an attached Amazon settlement report (Seller Central's tab-separated Flat File V2 .txt) into its journal entry and save it to Accounting → Amazon Payments. Use when the user attaches a settlement file and wants the journal entry / wants it added to Amazon Payments. Re-importing the same settlement replaces its saved entry. Report back the period, the Total, and whether it ties to Amazon's deposit.",
    input_schema: {
      type: "object",
      properties: {
        file_name: { type: "string", description: "Name of the attached file, exactly as listed in the chat." },
      },
      required: ["file_name"],
    },
  },
  async run(input, ctx) {
    const files = ctx.attachments ?? [];
    const wanted = str(input.file_name, 200);
    const file = files.find((f) => f.name === wanted) ?? (files.length === 1 ? files[0] : undefined);
    if (!file) {
      return {
        result: {
          imported: false,
          error: files.length ? `No attached file named "${wanted}".` : "No file is attached — ask the user to attach the settlement report with the paperclip.",
          attached: files.map((f) => f.name),
        },
      };
    }
    const out = await callApi<{ saved: boolean; replaced: boolean; entry: SavedSettlement }>(
      ctx,
      "POST",
      "/api/accounting/amazon-settlements",
      { text: file.text, file_name: file.name },
    );
    const e = out.entry;
    return {
      result: {
        imported: true,
        saved: out.saved,
        ...(out.saved ? {} : { note: "Saving isn't switched on yet (database migration pending) — the entry was built but not stored." }),
        replaced_existing: out.replaced,
        period: e.label,
        deposit_date: e.depositDate,
        columns: Object.fromEntries(JE_COLUMNS.map((c) => [JE_COLUMN_LABELS[c], e.columns[c]])),
        total: e.total,
        amazon_reported_total: e.reportedTotal,
        ties_to_deposit: e.reconciles,
      },
      action: {
        label: "Open Amazon Payments",
        href: `/accounting/amazon-payments?settlement=${encodeURIComponent(e.settlementId)}`,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Purchasing                                                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Accounting — Inventory journal                                     */
/* ------------------------------------------------------------------ */

const inventoryJournal: HelpTool = {
  page: "/accounting/inventory-journal",
  status: "Reading the inventory journal…",
  def: {
    name: "inventory_journal",
    description:
      "The monthly Inventory journal entry for QuickBooks Online since Jan 1 2026, from Fishbowl (same numbers as the Inventory Journal page). Inventory bills go to Inventory Asset, so each month: Dr Cost of Goods Sold / Cr Inventory Asset = beginning inventory + purchases (PO receipts at PO price) + added in production (finished goods made minus the parts they used — mainly Kapra fill & filling, billed to Inventory Asset but never received into Fishbowl as a part) − ending inventory (Fishbowl's nightly average-cost snapshot). A negative month flips the entry (Dr Inventory Asset / Cr COGS) — usually a big upward count adjustment. Without `month`: every month's beginning, purchases, ending, to-COGS, entry direction and units (made, used, shipped, adjusted), plus totals; the current month is marked in_progress (not final). With `month` and `item_detail: true`: that month's biggest items by to-COGS value (takes ~40 seconds — say so before calling).",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM, e.g. 2026-09. Omit for all months." },
        item_detail: { type: "boolean", description: "With month: include the item-by-item breakdown (slow, ~40s)." },
      },
    },
  },
  async run(input, ctx) {
    const month = str(input.month, 7);
    type Month = {
      month: string;
      label: string;
      inProgress: boolean;
      begValue: number;
      purchases: number;
      productionAdded: number;
      madeValue: number;
      usedValue: number;
      endValue: number;
      toCogs: number;
      units: Record<string, number>;
    };
    const all = await callApi<{ months: Month[]; accounts: { cogs: string; inventory: string } }>(
      ctx,
      "GET",
      "/api/accounting/inventory-journal",
    );
    const shape = (m: Month) => ({
      month: m.month,
      label: m.label,
      in_progress: m.inProgress,
      beginning: m.begValue,
      purchases: m.purchases,
      added_in_production: m.productionAdded,
      finished_goods_made_value: m.madeValue,
      parts_used_value: m.usedValue,
      ending: m.endValue,
      to_cogs: m.toCogs,
      entry:
        m.toCogs >= 0
          ? `Dr ${all.accounts.cogs} / Cr ${all.accounts.inventory} ${Math.abs(m.toCogs).toFixed(2)}`
          : `Dr ${all.accounts.inventory} / Cr ${all.accounts.cogs} ${Math.abs(m.toCogs).toFixed(2)}`,
      units: m.units,
    });

    if (!month) {
      const finished = all.months.filter((m) => !m.inProgress);
      return {
        result: {
          months: all.months.map(shape),
          totals_finished_months: {
            purchases: Math.round(finished.reduce((s, m) => s + m.purchases, 0) * 100) / 100,
            added_in_production: Math.round(finished.reduce((s, m) => s + m.productionAdded, 0) * 100) / 100,
            to_cogs: Math.round(finished.reduce((s, m) => s + m.toCogs, 0) * 100) / 100,
          },
          inventory_now: all.months[all.months.length - 1]?.endValue ?? null,
        },
        action: { label: "Open Inventory Journal", href: "/accounting/inventory-journal" },
      };
    }

    const m = all.months.find((x) => x.month === month);
    if (!m) return { result: { error: `No month ${month}. Available: ${all.months.map((x) => x.month).join(", ")}` } };
    const out: Record<string, unknown> = { ...shape(m) };
    if (input.item_detail === true) {
      const det = await callApi<{ items: Record<string, unknown>[] }>(
        ctx,
        "GET",
        `/api/accounting/inventory-journal?month=${encodeURIComponent(month)}`,
      );
      const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const items = [...det.items].sort((a, b) => Math.abs(n(b.other_value_out)) - Math.abs(n(a.other_value_out)));
      out.item_count = items.length;
      out.items_sum_to_cogs = Math.round(items.reduce((s, i) => s + n(i.other_value_out), 0) * 100) / 100;
      out.top_items = items.slice(0, 25).map((i) => ({
        part: i.part,
        description: i.description,
        beginning: n(i.beg_value),
        purchases: n(i.purchased_value),
        added_in_production: n(i.production_added),
        ending: n(i.end_value),
        to_cogs: n(i.other_value_out),
        made: n(i.produced_qty),
        used: n(i.consumed_qty),
        shipped: n(i.shipped_qty),
        adjusted: n(i.adjusted_qty),
      }));
    }
    return { result: out, action: { label: `Open ${m.label}`, href: "/accounting/inventory-journal" } };
  },
};

const purchasingPlan: HelpTool = {
  page: "/inventory/purchasing",
  status: "Working out what to order…",
  def: {
    name: "purchasing_plan",
    description:
      "The Purchasing page's ingredient plan, from Fishbowl recipes (BOMs), stock, open POs, Point B and the minimums/prices people set — the same numbers as the page. Without `family`: every product family ranked by urgency with what its order would cost (use for 'what do I need to order?', 'where do I start?'). With `family` (a product line like 'mini hand creme', 'lotion', 'fragrance mist', or a product name/part): that family's products to make (months left, make, can make now / after ordering), the order per vendor (urgency now/soon/later, total, lead weeks, items with qty, price, which products each covers, and how far under a vendor's run minimum), ingredients to check in Fishbowl first, and stock to send to Kapra. Urgency 'now' means the products would run out before the ingredient could arrive and be filled at Kapra.",
    input_schema: {
      type: "object",
      properties: {
        family: { type: "string", description: "Product line, product name or part number. Omit for the overview of all families." },
        months: { type: "number", description: "Months of stock to plan for. Default 6." },
        include_all: { type: "boolean", description: "Plan for every product, not just At risk + Review ones. Default false." },
      },
    },
  },
  async run(input, ctx) {
    const qs = new URLSearchParams();
    const family = str(input.family, 120);
    if (family) qs.set("family", family);
    if (typeof input.months === "number" && input.months > 0) qs.set("months", String(Math.round(input.months)));
    if (input.include_all === true) qs.set("include", "all");
    const out = await callApi<Record<string, unknown> & { page?: string; family?: string }>(
      ctx,
      "GET",
      `/api/inventory/purchasing-plan?${qs}`,
    );
    return {
      result: out,
      action: { label: out.family ? `Open ${out.family} in Purchasing` : "Open Purchasing", href: out.page ?? "/inventory/purchasing" },
    };
  },
};

const recipeLookup: HelpTool = {
  page: "/inventory/purchasing",
  status: "Looking up the recipe…",
  def: {
    name: "recipe_lookup",
    description:
      "Look up a product's recipe (bill of materials: each ingredient, per-unit quantity, what we have, on order, vendor, how many products share it, how many we can make now and what runs out first), or one ingredient (usable stock and stock by location, open POs with due dates, vendor, current price and where it came from, lead time, its minimum/multiple/vendor run minimum, and every product it goes into). Use for 'what's in X?', 'how many X can we make?', 'what uses the white lotion bottle?', 'what does the 12oz pump cost?'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product or ingredient name words, or a part number." },
      },
      required: ["query"],
    },
  },
  async run(input, ctx) {
    const q = str(input.query, 120);
    const out = await callApi<Record<string, unknown>>(ctx, "GET", `/api/inventory/purchasing-plan?lookup=${encodeURIComponent(q)}`);
    return { result: out };
  },
};

const setOrderingRule: HelpTool = {
  page: "/inventory/purchasing",
  status: "Saving the ordering rule…",
  def: {
    name: "set_ordering_rule",
    description:
      "Save an ordering rule the Purchasing page applies (shared with everyone; same as the Ingredients & minimums drawer). For a VENDOR (exact Fishbowl vendor name, e.g. 'Kapra Cosmetics'): run_minimum (the whole order must reach this many units, e.g. Kapra's batch), each_item_minimum (every item at least this many, e.g. 500 per fragrance), lead_days. For an INGREDIENT (part number): min_order, multiple (order in packs of), price (per unit, overrides Fishbowl's last PO price), lead_days. Send null to clear a value back to Fishbowl's. Only set what the user explicitly told you; confirm what you saved.",
    input_schema: {
      type: "object",
      properties: {
        vendor: { type: "string", description: "Vendor name, for vendor rules." },
        part: { type: "string", description: "Ingredient part number, for ingredient rules (use recipe_lookup to find it)." },
        run_minimum: { type: ["number", "null"] },
        each_item_minimum: { type: ["number", "null"] },
        min_order: { type: ["number", "null"] },
        multiple: { type: ["number", "null"] },
        price: { type: ["number", "null"] },
        lead_days: { type: ["number", "null"] },
      },
    },
  },
  async run(input, ctx) {
    const vendor = str(input.vendor, 120);
    const part = str(input.part, 60);
    const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k);
    let body: Record<string, unknown>;
    if (part) {
      body = { kind: "part", part };
      if (has("min_order")) body.min_qty = input.min_order;
      if (has("multiple")) body.multiple = input.multiple;
      if (has("price")) body.unit_price = input.price;
      if (has("lead_days")) body.lead_days = input.lead_days;
    } else if (vendor) {
      body = { kind: "vendor", vendor };
      if (has("run_minimum")) body.min_run_qty = input.run_minimum;
      if (has("each_item_minimum")) body.item_min_qty = input.each_item_minimum;
      if (has("lead_days")) body.lead_days = input.lead_days;
    } else {
      return { result: { saved: false, error: "Say which vendor or ingredient part the rule is for." } };
    }
    if (Object.keys(body).length <= 2) return { result: { saved: false, error: "No rule values were given." } };
    const res = await fetch(new URL("/api/inventory/purchasing-settings", ctx.origin), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: ctx.authorization },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { setting?: unknown; error?: string } | null;
    if (!res.ok) return { result: { saved: false, error: json?.error ?? `Couldn't save (${res.status}).` } };
    return {
      result: { saved: true, setting: json?.setting },
      action: { label: "Open Purchasing", href: "/inventory/purchasing" },
    };
  },
};

const STATIC_TOOLS: HelpTool[] = [
  inventoryJournal,
  purchasingPlan,
  recipeLookup,
  setOrderingRule,
  importAmazonSettlement,
  recallConversations,
  proposePublishing,
  createEmailTemplate,
  createTask,
  updateTask,
  createSocialPost,
  createBlogPost,
  ...dataTools,
];

/** The tools this role may use — each needs access to its page ("*" = any signed-in staff). */
export function toolsForRole(role: UserRole): HelpTool[] {
  const allowed = getAllowedPaths(role);
  const ok = (t: HelpTool) => t.page === "*" || allowed.some((p) => t.page === p || t.page.startsWith(p + "/"));
  return [...reportTools(role).filter(ok), ...STATIC_TOOLS.filter(ok)];
}

/** Run a tool; errors come back as a result Claude can explain, never a throw. */
export async function runHelpTool(
  tools: HelpTool[],
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.def.name === name);
  if (!tool) return { result: { error: `That action isn't available to you: ${name}` } };
  try {
    return await tool.run(input, ctx);
  } catch (e) {
    console.error(`[sage:${name}]`, e);
    return { result: { error: e instanceof Error ? e.message : String(e) } };
  }
}

export function toolStatus(tools: HelpTool[], name: string): string {
  return tools.find((t) => t.def.name === name)?.status ?? "Working on it…";
}
