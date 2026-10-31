import type { UserRole } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { supabaseServer } from "@/lib/supabaseServer";
import { bucketDate, parseGroupKey, resolveRelativeDate } from "@/lib/reports/dates";

/**
 * The data Sage can read and report on — one entry per table/view the portal's
 * pages show. Each dataset is gated on the page that displays it: a user only
 * gets a dataset when their role can open that page, so Sage never shows
 * someone data the app wouldn't. Columns are an explicit allow-list (no card /
 * Stripe ids, tokens or HTML bodies).
 *
 * runQuery() powers both Sage's query_data tool (small result sets for the
 * chat) and /api/help/export (the full set as a CSV download).
 *
 * Adding a page? Add its dataset here so Sage can answer questions about it.
 */

type Dataset = {
  title: string;
  /** What a row is, plus anything needed to filter it correctly. */
  description: string;
  source: string;
  page: string;
  /** column → short description (empty string when the name says it all). */
  columns: Record<string, string>;
  defaultOrder: { column: string; ascending?: boolean };
  /** Restrict to the newest inventory snapshot (inventory_snapshot_items). */
  latestInventorySnapshot?: boolean;
};

const DATASETS: Record<string, Dataset> = {
  storefront_orders: {
    title: "Storefront & marketplace orders",
    description:
      "Orders from sassyandco.com, naturalinspirations.com, Faire and MarketTime (the Orders page). One row per order; line items in `items`. Abandoned carts have payment_status other than 'paid' on D2C. Archived orders have archived_at set.",
    source: "orders",
    page: "/storefronts/purchases",
    columns: {
      number: "order number",
      created_at: "placed at",
      source: "sassy | ni | faire | markettime",
      store: "",
      channel: "d2c | wholesale",
      status: "",
      payment_status: "paid, pending…",
      business_name: "",
      contact_name: "",
      email: "",
      phone: "",
      subtotal: "",
      shipping: "",
      tax: "",
      discount: "",
      total: "",
      items: "line items (json)",
      sales_rep: "",
      payment_terms: "",
      external_ref: "marketplace order id",
      fishbowl_customer: "Fishbowl customer it books under",
      fishbowl_entered_at: "null = still needs Fishbowl",
      fishbowl_estimate_num: "",
      scheduled_ship_date: "ship-by date",
      carrier: "",
      tracking_code: "null = no tracking yet",
      shipped_at: "",
      delivered_at: "",
      archived_at: "",
      note: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  wholesale_customers: {
    title: "Wholesale customers (sales summary)",
    description:
      "One row per wholesale customer from Fishbowl sales history (the Wholesale customers page): lifetime + per-year sales, last order, rep/agency.",
    source: "customer_summary",
    page: "/customers",
    columns: {
      customerid: "Fishbowl customer id",
      name: "",
      bill_to_state: "full state name, e.g. Minnesota (not MN)",
      channel: "Fishbowl channel code (GIFT, WEB, …)",
      first_order_date: "",
      last_order_date: "",
      last_order_amount: "",
      lifetime_orders: "",
      lifetime_revenue: "",
      lifetime_aov: "",
      sales_2023: "",
      sales_2024: "",
      sales_2025: "",
      sales_2026: "",
      brands_purchased: "",
      agency_code: "",
      rep_name: "",
    },
    defaultOrder: { column: "sales_2026", ascending: false },
  },
  wholesale_contacts: {
    title: "Wholesale customer contacts",
    description: "Contact + address details per wholesale customer (join to wholesale_customers by customerid).",
    source: "customer_contact_summary",
    page: "/customers",
    columns: {
      customerid: "",
      customer_name: "",
      email: "",
      phone: "",
      billto_city: "",
      billto_state: "full state name",
      shipto_address: "",
      shipto_city: "",
      shipto_state: "full state name",
      shipto_zip: "",
      first_order_date: "",
      last_order_date: "",
      order_count: "",
      lifetime_revenue: "",
      primary_channel: "",
    },
    defaultOrder: { column: "lifetime_revenue", ascending: false },
  },
  d2c_customers: {
    title: "D2C customers",
    description: "One row per direct-to-consumer shopper (the D2C customers page): lifetime + per-year sales.",
    source: "d2c_customer_summary",
    page: "/customers/d2c",
    columns: {
      name: "",
      email: "",
      bill_to_state: "full state name, e.g. Minnesota (not MN)",
      customerid: "",
      channel: "",
      first_order_date: "",
      last_order_date: "",
      lifetime_orders: "",
      lifetime_revenue: "",
      lifetime_aov: "",
      sales_2023: "",
      sales_2024: "",
      sales_2025: "",
      sales_2026: "",
    },
    defaultOrder: { column: "lifetime_revenue", ascending: false },
  },
  products: {
    title: "Products (catalog)",
    description: "One row per Fishbowl part (the Products page): names, brand, pricing, case pack, demand settings, storefront flags.",
    source: "inventory_products",
    page: "/products",
    columns: {
      part: "part number",
      display_name: "",
      product_form: "",
      fragrance: "",
      size: "",
      collection: "",
      brand: "NI | Sassy",
      product_type: "FG = finished good",
      part_type: "",
      is_tester: "",
      msrp: "",
      wholesale_price: "",
      cogs: "",
      case_pack: "",
      moq: "",
      lead_time_months: "",
      avg_monthly_demand: "units/month",
      min_qty: "",
      max_qty: "",
      storefront_channel: "d2c | wholesale | both",
      storefront_in_stock: "",
      barcode: "",
      weight_oz: "",
    },
    defaultOrder: { column: "part", ascending: true },
  },
  inventory: {
    title: "Fishbowl inventory (latest snapshot)",
    description:
      "Fishbowl's stock per part, from the most recent snapshot (refreshed ~3×/day). NOT the source of truth: the Inventory page forecasts on Point B's live AVAILABLE count, which this table doesn't hold. For a single part's stock, use get_inventory (it returns Point B live + Fishbowl + variance); use this table for bulk lists/aggregates of Fishbowl figures or on_order. Join to products by part for brand/demand.",
    source: "inventory_snapshot_items",
    page: "/inventory",
    columns: {
      part: "",
      description: "",
      warehouse: "",
      on_hand: "",
      allocated: "",
      available: "on_hand minus allocated",
      on_order: "",
      committed: "",
      short: "",
      not_available: "",
    },
    defaultOrder: { column: "part", ascending: true },
    latestInventorySnapshot: true,
  },
  units_sold_90d: {
    title: "Units sold, last 90 days",
    description: "Units sold per part over the last 90 days — use with inventory for months-of-stock.",
    source: "units_by_product_last_90_days",
    page: "/inventory",
    columns: { part: "", units_last_90_days: "" },
    defaultOrder: { column: "units_last_90_days", ascending: false },
  },
  sales_by_product_month: {
    title: "Sales by product, month and channel",
    description:
      "Fishbowl sales rolled up per month × product × segment (the Sales Analysis pages). month is the first of the month (YYYY-MM-01). segment is 'Wholesale' or 'D2C'. typename 'Sale' is product revenue; other typenames are discounts/shipping/etc. Sum revenue/units with group_by for reports.",
    source: "sales_by_product_month_channel",
    page: "/sales",
    columns: {
      month: "YYYY-MM-01",
      segment: "Wholesale | D2C",
      productnum: "part number",
      display_name: "",
      fragrance: "",
      typename: "Sale, Discount Amount, …",
      brand: "NI | Sassy",
      units_fulfilled: "",
      revenue: "",
    },
    defaultOrder: { column: "month", ascending: false },
  },
  sales_orders: {
    title: "Fishbowl sales orders",
    description: "One row per Fishbowl sales order (all channels). datecompleted is when it was fulfilled. Line items are in sales_order_items.",
    source: "sales_orders_current",
    page: "/sales",
    columns: {
      num: "SO number",
      customerid: "",
      billtoname: "",
      customercontact: "",
      email: "",
      customerpo: "",
      shiptocity: "",
      shiptostate: "full state name",
      status: "",
      channel: "",
      datecompleted: "",
      totalprice: "",
    },
    defaultOrder: { column: "datecompleted", ascending: false },
  },
  sales_order_items: {
    title: "Fishbowl sales order lines",
    description: "Line items of Fishbowl sales orders (soid links to the order's id).",
    source: "so_items_current",
    page: "/sales",
    columns: {
      soid: "",
      productnum: "part number",
      description: "",
      typename: "",
      qtyordered: "",
      qtyfulfilled: "",
      totalprice: "",
      totalcost: "",
    },
    defaultOrder: { column: "soid", ascending: false },
  },
  storefront_accounts: {
    title: "Storefront accounts",
    description: "Every storefront account — D2C and wholesale (the Accounts page). wholesale_status: pending | approved | denied.",
    source: "storefront_profiles",
    page: "/storefronts/accounts",
    columns: {
      business_name: "",
      contact_name: "",
      email: "",
      phone: "",
      role: "d2c | wholesale",
      wholesale_status: "",
      signup_store: "sassy | ni",
      sales_rep: "",
      rep_group: "",
      account_number: "",
      business_type: "",
      created_at: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  prebookings: {
    title: "Holiday prebookings",
    description: "Holiday prebook reservations from wholesale buyers (the Prebookings page), with quantities per item.",
    source: "holiday_prebook_requests",
    page: "/storefronts/prebookings",
    columns: {
      created_at: "",
      store: "",
      business_name: "",
      contact_name: "",
      email: "",
      phone: "",
      status: "",
      hand_creme_cases_total: "",
      hand_creme_units_total: "",
      gift_sets_qty: "",
      lip_butter_qty: "",
      hand_creme_display_qty: "",
      display_qty: "",
      notes: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  discounts: {
    title: "Discount codes",
    description: "Storefront discounts (the Discounts page). kind percent|amount; unique_codes = batch of one-time codes.",
    source: "storefront_discounts",
    page: "/storefronts/discounts",
    columns: {
      code: "",
      brand: "",
      kind: "",
      value: "",
      min_subtotal: "",
      free_shipping: "",
      active: "",
      starts_at: "",
      ends_at: "",
      per_customer_limit: "",
      unique_codes: "",
      scope_kind: "",
      note: "",
      created_at: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  feedback: {
    title: "Storefront feedback & testimonials",
    description: "Shopper feedback on the storefront itself (the Feedback & Testimonials page).",
    source: "storefront_feedback",
    page: "/storefronts/feedback",
    columns: {
      store: "",
      rating: "",
      ux_rating: "",
      headline: "",
      body: "",
      recommendations: "",
      had_issues: "",
      issues: "",
      name: "",
      email: "",
      consent_publish: "",
      status: "",
      created_at: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  support_conversations: {
    title: "Customer service chats",
    description: "Storefront chat conversations (the Customer Service page). status bot = still with the concierge bot.",
    source: "support_conversations",
    page: "/storefronts/conversations",
    columns: {
      store: "",
      channel: "",
      status: "",
      name: "",
      email: "",
      subject: "",
      message_count: "",
      last_message_at: "",
      agent_unread: "",
      created_at: "",
    },
    defaultOrder: { column: "last_message_at", ascending: false },
  },
  amazon_settlements: {
    title: "Amazon settlement journal entries",
    description:
      "Accounting → Amazon Payments: one row per Amazon settlement (payout), the bookkeeping journal entry built from the settlement report. Each row covers sales from start_date through end_date (about two weeks) and was paid into the bank on deposit_date, a few days after end_date. Name an entry by its period, e.g. '09/24/2026 to 10/08/2026 (deposited 10/10/2026)'. 'Which payment covers <date>' = start_date lte <date> AND end_date gte <date>; 'paid/deposited in <month>' = filter deposit_date; 'sales in <month/quarter>' = filter by end_date and say periods can straddle month ends. Amounts in dollars; fees/refunds are negative. total = the amount Amazon deposited.",
    source: "amazon_settlements",
    page: "/accounting/amazon-payments",
    columns: {
      settlement_id: "",
      start_date: "period start",
      end_date: "period end",
      deposit_date: "",
      sales: "",
      shipping: "",
      amazon_fees: "commission + FBA fulfillment + shipping chargebacks",
      advertising: "cost of advertising",
      promo_rebates: "shipping promotions",
      fba_fees: "inbound transportation + storage/removal/placement",
      refunded_sales: "",
      other: "item promotions, reimbursements, everything else",
      total: "",
      reconciles: "columns tie to Amazon's reported deposit",
      file_name: "",
      created_at: "uploaded at",
    },
    defaultOrder: { column: "start_date", ascending: false },
  },
  tasks: {
    title: "Tasks",
    description: "The Task List. status todo | in_progress | done.",
    source: "tasks",
    page: "/task-list",
    columns: {
      id: "",
      name: "",
      description: "",
      owner: "staff first name",
      priority: "High | Medium | Low",
      status: "",
      due_date: "",
      notes: "",
      completed: "",
      created_at: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  email_templates: {
    title: "Email templates",
    description: "The Email Templates library (content not included). Open one at /templates?edit=<id>.",
    source: "email_templates",
    page: "/templates",
    columns: {
      id: "",
      name: "",
      subject: "",
      preview_text: "",
      brand: "ni | sassy | both",
      channel: "wholesale | d2c | both",
      source: "blocks | html | text",
      status: "",
      purpose: "",
      description: "",
      last_used_at: "",
      created_at: "",
      updated_at: "",
    },
    defaultOrder: { column: "updated_at", ascending: false },
  },
  email_campaigns: {
    title: "Email campaign sends",
    description: "One-off email blasts (Campaign Results): target/sent/failed counts per send.",
    source: "email_send_jobs",
    page: "/automations/cohorts",
    columns: {
      subject_template: "subject",
      brand: "",
      transport: "",
      status: "",
      target_count: "",
      sent_count: "",
      failed_count: "",
      started_at: "",
      completed_at: "",
      created_at: "",
      error_summary: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  automations: {
    title: "Email automations",
    description: "Automated email journeys (the Automations page).",
    source: "automations",
    page: "/automations",
    columns: { id: "", name: "", description: "", enabled: "", trigger_type: "", created_at: "", updated_at: "" },
    defaultOrder: { column: "updated_at", ascending: false },
  },
  unsubscribes: {
    title: "Unsubscribes & bounces",
    description: "Email suppressions (the Deliverability page): who opted out or bounced, and why.",
    source: "email_unsubscribes",
    page: "/email/deliverability",
    columns: { email: "", customer_type: "", customer_ref: "", source: "link | bounce | complaint …", reason: "", created_at: "" },
    defaultOrder: { column: "created_at", ascending: false },
  },
  social_posts: {
    title: "Social media posts",
    description: "Instagram/Facebook posts (the Social Media page). status draft | scheduled | published | failed …",
    source: "social_posts",
    page: "/marketing/social",
    columns: {
      id: "",
      title: "",
      brand: "",
      platforms: "",
      post_type: "",
      caption: "",
      status: "",
      scheduled_at: "",
      published_at: "",
      last_error: "",
      created_at: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  blog_posts: {
    title: "Blog posts",
    description: "Storefront blog posts (the Blog Posts page). status draft | scheduled | published …",
    source: "blog_posts",
    page: "/marketing/blog",
    columns: {
      id: "",
      title: "",
      brand: "",
      status: "",
      publish_at: "",
      published_at: "",
      tags: "",
      seo_meta: "",
      slug: "",
      created_at: "",
    },
    defaultOrder: { column: "created_at", ascending: false },
  },
  sales_reps: {
    title: "Sales rep directory",
    description: "External sales reps and their agencies (the Rep Directory).",
    source: "sales_reps",
    page: "/sales-team",
    columns: { agency_code: "", agency: "", name: "", email: "", phone: "", city: "", state: "", territory: "", samples: "" },
    defaultOrder: { column: "agency", ascending: true },
  },
  stock_alerts: {
    title: "Back-in-stock alert signups",
    description: "Shoppers waiting for an out-of-stock NI product (notified_at set once emailed).",
    source: "stock_alerts",
    page: "/products",
    columns: { email: "", part: "", brand: "", product_name: "", created_at: "", notified_at: "" },
    defaultOrder: { column: "created_at", ascending: false },
  },
};

/* ------------------------------------------------------------------ */
/* Access                                                             */
/* ------------------------------------------------------------------ */

export function datasetsForRole(role: UserRole): string[] {
  const allowed = getAllowedPaths(role);
  return Object.entries(DATASETS)
    .filter(([, d]) => allowed.some((p) => d.page === p || d.page.startsWith(p + "/")))
    .map(([name]) => name);
}

/** The catalog as text, for the query tool's description. */
export function describeDatasets(names: string[]): string {
  return names
    .map((n) => {
      const d = DATASETS[n];
      const cols = Object.entries(d.columns)
        .map(([c, why]) => (why ? `${c} (${why})` : c))
        .join(", ");
      return `- ${n} — ${d.title}. ${d.description}\n  Columns: ${cols}`;
    })
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Query                                                              */
/* ------------------------------------------------------------------ */

export const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in", "is_null", "not_null"] as const;
export const METRIC_FNS = ["sum", "count", "avg", "min", "max"] as const;

export type QuerySpec = {
  dataset: string;
  columns?: string[];
  filters?: { column: string; op: (typeof FILTER_OPS)[number]; value?: unknown }[];
  order_by?: string;
  descending?: boolean;
  limit?: number;
  group_by?: string[];
  metrics?: { fn: (typeof METRIC_FNS)[number]; column?: string }[];
};

export type QueryResult = {
  dataset: string;
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  /** Rows matching the filters (before grouping / limit). */
  total: number;
  truncated: boolean;
};

const PAGE = 1000;

/** Validate a spec against the catalog and the role. Throws a readable error. */
function check(spec: QuerySpec, role: UserRole): Dataset {
  const d = DATASETS[spec.dataset];
  if (!d) throw new Error(`Unknown dataset "${spec.dataset}".`);
  if (!datasetsForRole(role).includes(spec.dataset)) throw new Error(`Your account doesn't have access to ${d.title}.`);
  const known = (c: string) => {
    if (!(c in d.columns)) throw new Error(`"${c}" isn't a column of ${spec.dataset}. Columns: ${Object.keys(d.columns).join(", ")}`);
  };
  spec.columns?.forEach(known);
  spec.filters?.forEach((f) => {
    known(f.column);
    if (!FILTER_OPS.includes(f.op)) throw new Error(`Unknown filter op "${f.op}".`);
  });
  if (spec.order_by && !spec.group_by?.length) known(spec.order_by);
  // "created_at:month" groups a date column by period (see lib/reports/dates).
  spec.group_by?.forEach((g) => known(parseGroupKey(g).column));
  spec.metrics?.forEach((m) => {
    if (!METRIC_FNS.includes(m.fn)) throw new Error(`Unknown metric "${m.fn}".`);
    if (m.column) known(m.column);
    else if (m.fn !== "count") throw new Error(`${m.fn} needs a column.`);
  });
  return d;
}

async function latestSnapshotId(): Promise<string | null> {
  const { data } = await supabaseServer
    .from("inventory_uploads")
    .select("id")
    .order("pulled_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, spec: QuerySpec, snapshotId: string | null) {
  if (snapshotId) q = q.eq("upload_id", snapshotId);
  for (const f of spec.filters ?? []) {
    // "@start_of_month", "@today-30d"… resolve to a date at run time.
    const v = resolveRelativeDate(f.value) as string | number | boolean;
    switch (f.op) {
      case "eq": q = q.eq(f.column, v); break;
      case "neq": q = q.neq(f.column, v); break;
      case "gt": q = q.gt(f.column, v); break;
      case "gte": q = q.gte(f.column, v); break;
      case "lt": q = q.lt(f.column, v); break;
      case "lte": q = q.lte(f.column, v); break;
      case "contains": q = q.ilike(f.column, `%${String(v ?? "").replace(/[%_]/g, "")}%`); break;
      case "in": q = q.in(f.column, Array.isArray(f.value) ? f.value.map((x) => resolveRelativeDate(x)) : [v]); break;
      case "is_null": q = q.is(f.column, null); break;
      case "not_null": q = q.not(f.column, "is", null); break;
    }
  }
  return q;
}

/**
 * Run a query. Plain queries return up to `maxRows` rows; with group_by/metrics
 * the matching rows (up to `scanLimit`) are aggregated here, one row per group.
 */
export async function runQuery(
  spec: QuerySpec,
  role: UserRole,
  opts: { maxRows: number; scanLimit?: number },
): Promise<QueryResult> {
  const d = check(spec, role);
  const snapshotId = d.latestInventorySnapshot ? await latestSnapshotId() : null;
  const grouped = !!(spec.group_by?.length || spec.metrics?.length);

  if (!grouped) {
    const columns = spec.columns?.length ? spec.columns : Object.keys(d.columns);
    const order = spec.order_by ?? d.defaultOrder.column;
    const ascending = spec.order_by ? !spec.descending : d.defaultOrder.ascending ?? false;
    const want = Math.max(1, Math.min(spec.limit ?? opts.maxRows, opts.maxRows));
    const rows: Record<string, unknown>[] = [];
    let total = 0;
    // PostgREST caps a request at 1000 rows — page through, ordered by the sort
    // column (plus a tiebreak) so pages don't skip rows.
    for (let from = 0; rows.length < want; from += PAGE) {
      let q = supabaseServer
        .from(d.source)
        .select(columns.join(","), { count: from === 0 ? "exact" : undefined })
        .order(order, { ascending, nullsFirst: false });
      if (order !== columns[0]) q = q.order(columns[0], { ascending: true });
      q = applyFilters(q, spec, snapshotId).range(from, from + Math.min(PAGE, want - rows.length) - 1);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      if (from === 0) total = count ?? 0;
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < PAGE) break;
    }
    return { dataset: spec.dataset, title: d.title, columns, rows, total, truncated: total > rows.length };
  }

  // Aggregate: fetch only the columns involved, then group in memory.
  const groupBy = spec.group_by ?? [];
  const groupKeys = groupBy.map(parseGroupKey);
  const groupValue = (r: Record<string, unknown>, i: number) => {
    const { column, bucket } = groupKeys[i];
    return bucket ? bucketDate(r[column], bucket) : r[column] ?? null;
  };
  const metrics = spec.metrics?.length ? spec.metrics : [{ fn: "count" as const }];
  const needed = [...new Set([...groupKeys.map((g) => g.column), ...metrics.flatMap((m) => (m.column ? [m.column] : []))])];
  const select = needed.length ? needed : [Object.keys(d.columns)[0]];
  const scanLimit = opts.scanLimit ?? 100_000;
  const raw: Record<string, unknown>[] = [];
  let total = 0;
  for (let from = 0; from < scanLimit; from += PAGE) {
    let q = supabaseServer
      .from(d.source)
      .select(select.join(","), { count: from === 0 ? "exact" : undefined })
      .order(select[0], { ascending: true });
    if (select[1]) q = q.order(select[1], { ascending: true });
    q = applyFilters(q, spec, snapshotId).range(from, from + PAGE - 1);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    if (from === 0) total = count ?? 0;
    raw.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }

  const label = (m: { fn: string; column?: string }) => (m.column ? `${m.fn}_${m.column}` : m.fn);
  const groups = new Map<string, { key: Record<string, unknown>; vals: number[][]; n: number }>();
  for (const r of raw) {
    const key = groupBy.map((_, i) => groupValue(r, i));
    const k = JSON.stringify(key);
    let g = groups.get(k);
    if (!g) {
      g = { key: Object.fromEntries(groupBy.map((c, i) => [c, key[i]])), vals: metrics.map(() => []), n: 0 };
      groups.set(k, g);
    }
    g.n += 1;
    metrics.forEach((m, i) => {
      if (!m.column) return;
      const v = Number(r[m.column]);
      if (r[m.column] !== null && r[m.column] !== "" && Number.isFinite(v)) g!.vals[i].push(v);
    });
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  let rows = [...groups.values()].map((g) => {
    const out: Record<string, unknown> = { ...g.key };
    metrics.forEach((m, i) => {
      const v = g.vals[i];
      out[label(m)] =
        m.fn === "count"
          ? m.column ? v.length : g.n
          : !v.length
            ? null
            : m.fn === "sum"
              ? round(v.reduce((a, b) => a + b, 0))
              : m.fn === "avg"
                ? round(v.reduce((a, b) => a + b, 0) / v.length)
                : m.fn === "min"
                  ? Math.min(...v)
                  : Math.max(...v);
    });
    return out;
  });

  const columns = [...groupBy, ...metrics.map(label)];
  const sortKey = spec.order_by && columns.includes(spec.order_by) ? spec.order_by : groupBy.length ? label(metrics[0]) : null;
  if (sortKey) {
    const asc = spec.order_by ? !spec.descending : false;
    rows.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return asc ? c : -c;
    });
  }
  const groupCount = rows.length;
  rows = rows.slice(0, Math.max(1, Math.min(spec.limit ?? opts.maxRows, opts.maxRows)));
  return {
    dataset: spec.dataset,
    title: d.title,
    columns,
    rows,
    total,
    truncated: groupCount > rows.length || raw.length < total,
  };
}

/** Rows → CSV (RFC 4180 quoting; objects/arrays as JSON). */
export function toCsv(result: QueryResult): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [result.columns.join(","), ...result.rows.map((r) => result.columns.map((c) => cell(r[c])).join(","))].join("\r\n");
}
