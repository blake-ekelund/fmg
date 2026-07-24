import type Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabaseServer";
import { stageOf } from "@/lib/orderStage";

/**
 * Read-only tools for the REP PORTAL assistant, hard-scoped to one agency.
 *
 * This is deliberately separate from lib/assistant/tools.ts (the internal Slack
 * assistant, which can see every agency). Here the agency is baked in at
 * construction by `buildPortalTools(agency)` and is NEVER a model-supplied
 * argument — so a rep, or a prompt-injection attempt in a customer name, can't
 * widen the scope to another agency's data. Every query is constrained to the
 * agency's own customer set, exactly like the /api/portal/* routes.
 */

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
};

const nf = new Intl.NumberFormat("en-US");
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Portal grouping: estimates/issued/in-progress all read as "open". */
function portalStage(status: string | null): "open" | "completed" | "cancelled" {
  const s = stageOf(status);
  return s === "estimate" ? "open" : s;
}

/** Relative link to a customer's detail page — handed to the model so it can
    hyperlink a name without ever constructing (or mis-encoding) a URL itself. */
function customerLink(customerid: string | null | undefined): string | null {
  return customerid ? `/portal/customers/${encodeURIComponent(customerid)}` : null;
}

/** Link into the Orders page pre-filtered to one order number. */
function orderLink(num: string | null | undefined): string | null {
  return num ? `/portal/orders?q=${encodeURIComponent(num)}` : null;
}

export type PortalToolset = {
  defs: ToolDef[];
  run: (name: string, input: Record<string, unknown>) => Promise<unknown>;
};

export function buildPortalTools(agency: string): PortalToolset {
  /** The agency's customers — the boundary every tool is fenced inside. */
  async function agencyCustomers() {
    const { data, error } = await supabaseServer
      .from("customer_summary")
      .select("customerid, name")
      .eq("agency_code", agency);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { customerid: string; name: string }[];
    return {
      ids: rows.map((r) => r.customerid).filter(Boolean),
      nameById: new Map(rows.map((r) => [r.customerid, r.name])),
    };
  }

  async function salesOverview() {
    const { data, error } = await supabaseServer
      .from("customer_summary")
      .select("customerid, name, bill_to_state, channel, sales_2025, sales_2026, last_order_date")
      .eq("agency_code", agency);
    if (error) return { error: error.message };
    const rows = (data ?? []) as {
      customerid: string;
      name: string;
      bill_to_state: string | null;
      channel: string | null;
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
        link: customerLink(r.customerid),
        state: r.bill_to_state,
        sales_2026: money(r.sales_2026 ?? 0),
        sales_2025: money(r.sales_2025 ?? 0),
      }));

    // Accounts that bought last year but not yet this year — the follow-up list.
    const slipping = rows
      .filter((r) => (r.sales_2025 ?? 0) > 0 && (r.sales_2026 ?? 0) === 0)
      .sort((a, b) => (b.sales_2025 ?? 0) - (a.sales_2025 ?? 0))
      .slice(0, 10)
      .map((r) => ({
        customer: r.name,
        link: customerLink(r.customerid),
        state: r.bill_to_state,
        last_year: money(r.sales_2025 ?? 0),
        last_order_date: r.last_order_date,
      }));

    return {
      scope: "your agency",
      customers: nf.format(rows.length),
      sales_2025: money(sales_2025),
      sales_2026: money(sales_2026),
      variance: money(variance),
      variance_pct: `${variance_pct.toFixed(1)}%`,
      top_customers: top,
      not_yet_ordered_this_year: slipping,
    };
  }

  async function findCustomer(input: { query?: string }) {
    const search = (input.query ?? "").trim();
    if (!search) return { error: "Provide a customer name to look up." };

    const { data, error } = await supabaseServer
      .from("customer_summary")
      .select(
        "customerid, name, channel, bill_to_state, first_order_date, last_order_date, last_order_amount, lifetime_orders, lifetime_revenue, sales_2025, sales_2026",
      )
      // Scope AND search — the agency filter is not negotiable.
      .eq("agency_code", agency)
      .or(`name.ilike.%${search}%,customerid.ilike.%${search}%`)
      .order("sales_2026", { ascending: false, nullsFirst: false })
      .limit(8);
    if (error) return { error: error.message };
    const rows = (data ?? []) as Record<string, string | number | null>[];
    if (rows.length === 0) {
      return { results: [], note: "No customer in your agency matches that." };
    }

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
        name: r.name,
        link: customerLink(r.customerid as string | null),
        channel: r.channel,
        state: r.bill_to_state,
        last_order_date: r.last_order_date,
        last_order_amount: r.last_order_amount != null ? money(Number(r.last_order_amount)) : null,
        lifetime_orders: r.lifetime_orders,
        sales_2025: r.sales_2025 != null ? money(Number(r.sales_2025)) : null,
        sales_2026: r.sales_2026 != null ? money(Number(r.sales_2026)) : null,
      })),
      contact,
    };
  }

  async function findOrders(input: { query?: string; status?: string }) {
    const { ids, nameById } = await agencyCustomers();
    if (ids.length === 0) return { results: [], note: "No customers on file for your agency." };

    const search = (input.query ?? "").trim().replace(/[%,()]/g, "");
    const collected: {
      num: string | null;
      customerid: string | null;
      status: string | null;
      totalprice: number | null;
      datecompleted: string | null;
      dateissued: string | null;
      datecreated: string | null;
      shiptoname: string | null;
    }[] = [];

    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      let q = supabaseServer
        .from("sales_orders_raw")
        .select("num, customerid, status, totalprice, datecompleted, dateissued, datecreated, shiptoname")
        .in("customerid", ids.slice(i, i + CHUNK))
        .order("id", { ascending: false, nullsFirst: false })
        .limit(50);
      if (search) {
        q = q.or(`num.ilike.%${search}%,customerpo.ilike.%${search}%,shiptoname.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      collected.push(...(data ?? []));
    }

    const wantStage = (input.status ?? "").trim().toLowerCase();
    const filtered = wantStage
      ? collected.filter((o) => portalStage(o.status) === wantStage)
      : collected;

    filtered.sort((a, b) => {
      const da = a.datecompleted ?? a.dateissued ?? a.datecreated ?? "";
      const db = b.datecompleted ?? b.dateissued ?? b.datecreated ?? "";
      return da < db ? 1 : da > db ? -1 : 0;
    });

    return {
      results: filtered.slice(0, 15).map((o) => ({
        order: o.num,
        link: orderLink(o.num),
        customer: o.customerid ? (nameById.get(o.customerid) ?? o.customerid) : null,
        customer_link: customerLink(o.customerid),
        state: portalStage(o.status) === "open" ? "Open" : portalStage(o.status),
        total: money(o.totalprice ?? 0),
        date: o.datecompleted ?? o.dateissued ?? o.datecreated,
        ship_to: o.shiptoname,
      })),
    };
  }

  const defs: ToolDef[] = [
    {
      name: "sales_overview",
      description:
        "Get the signed-in rep's own agency performance: total 2025 vs 2026 sales, year-over-year variance, customer count, top customers, and accounts that bought last year but haven't yet ordered this year. Call this for any 'how am I doing', YoY, biggest-accounts, or who-to-follow-up-with question.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "find_customer",
      description:
        "Look up one of the rep's own customers by name and return their sales history, channel, last order, and (for a single match) contact details. Use when the rep asks about a specific store or account.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Customer name or id to search for." },
        },
        required: ["query"],
      },
    },
    {
      name: "find_orders",
      description:
        "Search the rep's own order history. Use to answer 'where's my order', to list a customer's recent orders, or to see what's still open. Optionally filter by status ('open', 'completed', or 'cancelled') and/or a search term (order number, PO, or ship-to name).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Order number, customer PO, or ship-to name." },
          status: {
            type: "string",
            enum: ["open", "completed", "cancelled"],
            description: "Restrict to one order status.",
          },
        },
      },
    },
  ];

  const executors: Record<string, (i: Record<string, unknown>) => Promise<unknown>> = {
    sales_overview: () => salesOverview(),
    find_customer: (i) => findCustomer(i as { query?: string }),
    find_orders: (i) => findOrders(i as { query?: string; status?: string }),
  };

  return {
    defs,
    async run(name, input) {
      const fn = executors[name];
      if (!fn) return { error: `Unknown tool: ${name}` };
      try {
        return await fn(input);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
