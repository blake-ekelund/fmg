import type Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Read-only "tools" the Slack assistant (Claude) can call to answer questions
 * about FMG's data. Each tool is a pair: a JSON-schema definition Claude sees,
 * and a server-side executor that runs a scoped Supabase query and returns a
 * compact result. Everything here is READ-ONLY — the assistant can look things
 * up but never write, email, or mutate. All queries run under the service-role
 * client; the caller (the Slack events route) has already confirmed the asker
 * is an internal FMG employee before any of this runs.
 */

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
};

const nf = new Intl.NumberFormat("en-US");
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/* ------------------------------------------------------------------ */
/* Inventory                                                          */
/* ------------------------------------------------------------------ */

async function latestInventoryUploadId(): Promise<string | null> {
  const { data } = await supabaseServer
    .from("inventory_uploads")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function getInventory(input: { part_number?: string; query?: string }) {
  const uploadId = await latestInventoryUploadId();
  if (!uploadId) return { error: "No inventory snapshot has been synced yet." };

  let q = supabaseServer
    .from("inventory_snapshot_items")
    .select("part, description, on_hand, available, on_order, short, uom")
    .eq("upload_id", uploadId);

  const part = input.part_number?.trim();
  const search = input.query?.trim();
  if (part) q = q.ilike("part", `%${part}%`);
  else if (search) q = q.or(`part.ilike.%${search}%,description.ilike.%${search}%`);

  const { data, error } = await q.order("part", { ascending: true }).limit(25);
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { results: [], note: "No matching parts found." };

  return {
    warehouse: "Point B Solutions",
    results: (data as Record<string, number | string>[]).map((r) => ({
      part: r.part,
      description: r.description,
      on_hand: r.on_hand,
      available: r.available,
      on_order: r.on_order,
      short: r.short,
      uom: r.uom,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Sales performance                                                  */
/* ------------------------------------------------------------------ */

async function salesSummary(input: { agency_code?: number }) {
  let q = supabaseServer
    .from("customer_summary")
    .select("name, agency_code, bill_to_state, sales_2025, sales_2026, last_order_date");
  if (input.agency_code != null) q = q.eq("agency_code", input.agency_code);

  const { data, error } = await q;
  if (error) return { error: error.message };
  const rows = (data ?? []) as {
    name: string;
    agency_code: number | null;
    bill_to_state: string | null;
    sales_2025: number | null;
    sales_2026: number | null;
    last_order_date: string | null;
  }[];

  const sales_2025 = rows.reduce((s, r) => s + (r.sales_2025 ?? 0), 0);
  const sales_2026 = rows.reduce((s, r) => s + (r.sales_2026 ?? 0), 0);
  const variance = sales_2026 - sales_2025;
  const variance_pct = sales_2025 > 0 ? (variance / sales_2025) * 100 : sales_2026 > 0 ? 100 : 0;

  const top = [...rows]
    .sort((a, b) => (b.sales_2026 ?? 0) - (a.sales_2026 ?? 0))
    .slice(0, 10)
    .map((r) => ({
      customer: r.name,
      state: r.bill_to_state,
      sales_2026: money(r.sales_2026 ?? 0),
      sales_2025: money(r.sales_2025 ?? 0),
      last_order: r.last_order_date,
    }));

  return {
    scope: input.agency_code != null ? `agency ${input.agency_code}` : "all customers",
    customers: nf.format(rows.length),
    sales_2025: money(sales_2025),
    sales_2026: money(sales_2026),
    variance: money(variance),
    variance_pct: `${variance_pct.toFixed(1)}%`,
    top_customers: top,
  };
}

/* ------------------------------------------------------------------ */
/* Customer lookup                                                    */
/* ------------------------------------------------------------------ */

async function customerLookup(input: { query: string }) {
  const search = input.query?.trim();
  if (!search) return { error: "Provide a customer name or id to look up." };

  const { data, error } = await supabaseServer
    .from("customer_summary")
    .select(
      "customerid, name, agency_code, channel, bill_to_state, first_order_date, last_order_date, last_order_amount, lifetime_orders, lifetime_revenue, sales_2025, sales_2026",
    )
    .or(`name.ilike.%${search}%,customerid.ilike.%${search}%`)
    .order("sales_2026", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) return { error: error.message };
  const rows = (data ?? []) as Record<string, string | number | null>[];
  if (rows.length === 0) return { results: [], note: "No matching customers found." };

  // For a single strong match, include contact detail.
  let contact: Record<string, unknown> | null = null;
  if (rows.length === 1) {
    const { data: c } = await supabaseServer
      .from("customer_contact_summary")
      .select("email, phone, billto_city, billto_state, shipto_city, shipto_state")
      .eq("customerid", rows[0].customerid as string)
      .maybeSingle();
    contact = (c as Record<string, unknown> | null) ?? null;
  }

  return {
    results: rows.map((r) => ({
      id: r.customerid,
      name: r.name,
      agency_code: r.agency_code,
      channel: r.channel,
      state: r.bill_to_state,
      last_order_date: r.last_order_date,
      last_order_amount: r.last_order_amount != null ? money(Number(r.last_order_amount)) : null,
      lifetime_orders: r.lifetime_orders,
      lifetime_revenue: r.lifetime_revenue != null ? money(Number(r.lifetime_revenue)) : null,
      sales_2025: r.sales_2025 != null ? money(Number(r.sales_2025)) : null,
      sales_2026: r.sales_2026 != null ? money(Number(r.sales_2026)) : null,
    })),
    contact,
  };
}

/* ------------------------------------------------------------------ */
/* Sales reps directory                                               */
/* ------------------------------------------------------------------ */

async function listSalesReps(input: { query?: string }) {
  let q = supabaseServer
    .from("sales_reps")
    .select("agency_code, agency, name, email, phone, city, state, territory");
  const search = input.query?.trim();
  if (search) {
    q = q.or(
      `name.ilike.%${search}%,agency.ilike.%${search}%,state.ilike.%${search}%,territory.ilike.%${search}%`,
    );
  }

  const { data, error } = await q.order("agency", { ascending: true }).limit(50);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { error: "The sales rep directory hasn't been set up yet." };
    }
    return { error: error.message };
  }
  const rows = (data ?? []) as Record<string, string | number | null>[];
  if (rows.length === 0) return { results: [], note: "No matching reps found." };
  return { results: rows };
}

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_inventory",
    description:
      "Look up current on-hand and available stock for FMG products at the Point B Solutions warehouse, from the latest Fishbowl inventory snapshot. Call this when the user asks about stock, availability, on-hand quantity, or whether a part/product is in stock. Search by part number or by a word in the product description.",
    input_schema: {
      type: "object",
      properties: {
        part_number: { type: "string", description: "Exact or partial part number, e.g. '100-00-01'." },
        query: { type: "string", description: "A word to match in the part number or description, e.g. 'lavender'." },
      },
    },
  },
  {
    name: "sales_summary",
    description:
      "Get aggregate sales performance: total 2025 vs 2026 wholesale sales, year-over-year variance, customer count, and the top customers by 2026 sales. Call this when the user asks how sales are doing, YoY comparisons, or who the biggest customers are. Optionally scope to one sales agency by its numeric agency_code.",
    input_schema: {
      type: "object",
      properties: {
        agency_code: { type: "integer", description: "Restrict the summary to a single sales agency by its agency_code." },
      },
    },
  },
  {
    name: "customer_lookup",
    description:
      "Find a specific customer by name or id and return their sales history, agency, channel, last order, and (for a single exact match) contact info. Call this when the user asks about a particular customer or store.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name or customer id to search for." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_sales_reps",
    description:
      "Look up FMG's external sales reps / agencies from the rep directory. Call this when the user asks who the rep is for an area, an agency's contact info, or which reps cover a state/territory. Optionally filter by a rep name, agency name, state, or territory.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Rep name, agency name, state, or territory to filter by." },
      },
    },
  },
];

type Executor = (input: Record<string, unknown>) => Promise<unknown>;

const EXECUTORS: Record<string, Executor> = {
  get_inventory: (i) => getInventory(i as { part_number?: string; query?: string }),
  sales_summary: (i) => salesSummary(i as { agency_code?: number }),
  customer_lookup: (i) => customerLookup(i as { query: string }),
  list_sales_reps: (i) => listSalesReps(i as { query?: string }),
};

/** Run a tool by name; unknown names and thrown errors become a tool error. */
export async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    return await fn(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
