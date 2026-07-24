import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { fetchOpenOrderCustomerIds } from "@/lib/orderStage";
import { properCase } from "@/lib/textCase";
import {
  MONEY_FMT,
  addBrandedSheet,
  brandWorkbook,
  finishSheet,
  generatedLabel,
  xlsxResponse,
} from "@/lib/portalExport";
import type { PortalCustomer } from "@/components/portal/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Branded FMG .xlsx exports of the rep's own accounts, enriched with contact
 * details (email, phone, billing address).
 *
 * GET  ?report=not-ordered|at-risk|churned|all — a preset slice of the book.
 * POST { ids, mode, note } — the accounts currently on screen (the customers-
 *      page Export button), scoped to the rep's agency and using the same sales
 *      window (full year vs YTD) the rep was viewing.
 *
 * Both are agency-scoped via resolvePortalAgency. The POST intersects the posted
 * ids with the agency's own customer set, so a crafted body can never pull
 * another agency's contact data.
 */

const ACTIVE_DAYS = 180;
const CHURN_DAYS = 365;

type Status = "active" | "at_risk" | "churned" | "none";

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  at_risk: "At risk",
  churned: "Churned",
  none: "No orders",
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

function statusOf(lastOrder: string | null, hasOpen: boolean): Status {
  if (hasOpen) return "active";
  const d = daysSince(lastOrder);
  if (d === null) return "none";
  if (d <= ACTIVE_DAYS) return "active";
  if (d <= CHURN_DAYS) return "at_risk";
  return "churned";
}

type Contact = {
  email: string | null;
  phone: string | null;
  billto_address: string | null;
  billto_city: string | null;
  billto_state: string | null;
  billto_zip: string | null;
};

/** Contact rows keyed by customerid, chunked so the IN() list can't overflow. */
async function fetchContacts(ids: string[]): Promise<Map<string, Contact>> {
  const map = new Map<string, Contact>();
  const clean = ids.filter(Boolean);
  const CHUNK = 200;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const { data } = await supabaseServer
      .from("customer_contact_summary")
      .select("customerid, email, phone, billto_address, billto_city, billto_state, billto_zip")
      .in("customerid", clean.slice(i, i + CHUNK));
    for (const c of (data ?? []) as (Contact & { customerid: string })[]) {
      map.set(c.customerid, c);
    }
  }
  return map;
}

/** Address/city/state/zip for the export, preferring contact over list fields. */
function addressCells(contact: Contact | undefined, fallbackCity?: string | null, fallbackState?: string | null) {
  return {
    address: contact?.billto_address ? properCase(contact.billto_address) : "",
    city: properCase(contact?.billto_city ?? fallbackCity ?? ""),
    state: contact?.billto_state ?? fallbackState ?? "",
    zip: contact?.billto_zip ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
  };
}

/* ── GET: preset report ─────────────────────────────────────────────────── */

type Report = "not-ordered" | "at-risk" | "churned" | "all";

const REPORTS: Record<Report, { title: string; sheet: string; file: string }> = {
  "not-ordered": {
    title: "Accounts that haven't ordered in 2026",
    sheet: "Not ordered 2026",
    file: "accounts_not_ordered_2026",
  },
  "at-risk": { title: "At-risk accounts (6–12 months quiet)", sheet: "At risk", file: "accounts_at_risk" },
  churned: { title: "Churned accounts (12+ months quiet)", sheet: "Churned", file: "accounts_churned" },
  all: { title: "All accounts", sheet: "Accounts", file: "accounts" },
};

type Row = {
  customerid: string;
  name: string;
  channel: string | null;
  bill_to_state: string | null;
  last_order_date: string | null;
  last_order_amount: number | null;
  lifetime_orders: number | null;
  lifetime_revenue: number | null;
  sales_2023: number | null;
  sales_2024: number | null;
  sales_2025: number | null;
  sales_2026: number | null;
};

export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return Response.json({ error: "unauthorized" }, { status: 401 });

  const raw = (new URL(request.url).searchParams.get("report") ?? "all").trim();
  const report: Report = (["not-ordered", "at-risk", "churned", "all"] as Report[]).includes(
    raw as Report,
  )
    ? (raw as Report)
    : "all";
  const meta = REPORTS[report];

  const agency = String(rep.agencyCode);
  const { data, error } = await supabaseServer
    .from("customer_summary")
    .select(
      "customerid, name, channel, bill_to_state, last_order_date, last_order_amount, lifetime_orders, lifetime_revenue, sales_2023, sales_2024, sales_2025, sales_2026",
    )
    .eq("agency_code", agency);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const openIds = await fetchOpenOrderCustomerIds(supabaseServer, {
    customerIds: rows.map((r) => r.customerid).filter(Boolean),
  });

  const withStatus = rows.map((r) => ({ r, status: statusOf(r.last_order_date, openIds.has(r.customerid)) }));

  let selected = withStatus;
  if (report === "not-ordered") {
    selected = withStatus.filter(
      ({ r, status }) => r.last_order_date != null && (r.sales_2026 ?? 0) === 0 && status !== "active",
    );
  } else if (report === "at-risk") {
    selected = withStatus.filter(({ status }) => status === "at_risk");
  } else if (report === "churned") {
    selected = withStatus.filter(({ status }) => status === "churned");
  }

  const rank = (x: { r: Row }) => (report === "all" ? x.r.sales_2026 ?? 0 : x.r.sales_2025 ?? 0);
  selected.sort((a, b) => rank(b) - rank(a));

  const contacts = await fetchContacts(selected.map(({ r }) => r.customerid));

  const wb = brandWorkbook();
  const ws = addBrandedSheet(wb, {
    name: meta.sheet,
    title: meta.title,
    subtitle: `${selected.length.toLocaleString()} accounts  ·  ${generatedLabel()}`,
    columns: [
      { header: "Customer", key: "name", width: 32 },
      { header: "ID", key: "id", width: 12 },
      { header: "Channel", key: "channel", width: 14 },
      { header: "Status", key: "status", width: 10 },
      { header: "Email", key: "email", width: 26 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Address", key: "address", width: 28 },
      { header: "City", key: "city", width: 16 },
      { header: "State", key: "state", width: 7 },
      { header: "Zip", key: "zip", width: 9 },
      { header: "Last Order", key: "last", width: 12 },
      { header: "Last Order $", key: "lastAmt", width: 13, numFmt: MONEY_FMT },
      { header: "2023", key: "y23", width: 12, numFmt: MONEY_FMT },
      { header: "2024", key: "y24", width: 12, numFmt: MONEY_FMT },
      { header: "2025", key: "y25", width: 12, numFmt: MONEY_FMT },
      { header: "2026 YTD", key: "y26", width: 12, numFmt: MONEY_FMT },
      { header: "Lifetime Orders", key: "lo", width: 14 },
      { header: "Lifetime Revenue", key: "lr", width: 16, numFmt: MONEY_FMT },
    ],
  });

  for (const { r, status } of selected) {
    const a = addressCells(contacts.get(r.customerid), null, r.bill_to_state);
    ws.addRow({
      name: properCase(r.name),
      id: r.customerid,
      channel: r.channel ?? "",
      status: STATUS_LABEL[status],
      email: a.email,
      phone: a.phone,
      address: a.address,
      city: a.city,
      state: a.state,
      zip: a.zip,
      last: r.last_order_date ?? "",
      lastAmt: r.last_order_amount ?? 0,
      y23: r.sales_2023 ?? 0,
      y24: r.sales_2024 ?? 0,
      y25: r.sales_2025 ?? 0,
      y26: r.sales_2026 ?? 0,
      lo: r.lifetime_orders ?? 0,
      lr: r.lifetime_revenue ?? 0,
    });
  }
  finishSheet(ws, 18);

  const date = new Date().toISOString().slice(0, 10);
  return xlsxResponse(wb, `FMG_${meta.file}_${date}.xlsx`);
}

/* ── POST: the accounts currently on screen ─────────────────────────────── */

export async function POST(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { rows?: unknown; mode?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }
  const posted = (Array.isArray(body.rows) ? body.rows : []) as PortalCustomer[];
  const ytd = body.mode === "ytd";
  const note = typeof body.note === "string" ? body.note : "";

  // Scope: keep only the agency's own customers, however the client asked.
  const agency = String(rep.agencyCode);
  const { data: agencyRows, error } = await supabaseServer
    .from("customer_summary")
    .select("customerid")
    .eq("agency_code", agency);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const allowedIds = new Set(
    ((agencyRows ?? []) as { customerid: string }[]).map((r) => r.customerid),
  );
  const rows = posted.filter((r) => allowedIds.has(r.customerid));

  const contacts = await fetchContacts(rows.map((r) => r.customerid));

  const yr = (y: 2024 | 2025 | 2026) => (ytd ? `${y} YTD` : `${y}`);
  const salesFor = (c: PortalCustomer, y: 2024 | 2025 | 2026) =>
    (ytd ? c[`ytd_${y}` as const] : c[`sales_${y}` as const]) ?? 0;

  const wb = brandWorkbook();
  const ws = addBrandedSheet(wb, {
    name: "Customers",
    title: "My Customers",
    subtitle: [`${rows.length.toLocaleString()} accounts`, note, generatedLabel()]
      .filter(Boolean)
      .join("  ·  "),
    columns: [
      { header: "Customer ID", key: "id", width: 14 },
      { header: "Name", key: "name", width: 30 },
      { header: "Status", key: "status", width: 10 },
      { header: "Open order", key: "open", width: 11 },
      { header: "Channel", key: "channel", width: 14 },
      { header: "Email", key: "email", width: 26 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Address", key: "address", width: 28 },
      { header: "City", key: "city", width: 16 },
      { header: "State", key: "state", width: 7 },
      { header: "Zip", key: "zip", width: 9 },
      { header: "Last order", key: "last", width: 12 },
      { header: "Last order $", key: "lastamt", width: 14, numFmt: MONEY_FMT },
      { header: yr(2024), key: "y24", width: 13, numFmt: MONEY_FMT },
      { header: yr(2025), key: "y25", width: 13, numFmt: MONEY_FMT },
      { header: yr(2026), key: "y26", width: 13, numFmt: MONEY_FMT },
      { header: "Lifetime orders", key: "lto", width: 14 },
      { header: "Lifetime revenue", key: "ltr", width: 16, numFmt: MONEY_FMT },
    ],
  });

  for (const c of rows) {
    const a = addressCells(contacts.get(c.customerid), c.bill_to_city, c.bill_to_state);
    ws.addRow({
      id: c.customerid,
      name: properCase(c.name),
      status: STATUS_LABEL[statusOf(c.last_order_date, !!c.has_open_order)],
      open: c.has_open_order ? "Yes" : "No",
      channel: c.channel ?? "",
      email: a.email,
      phone: a.phone,
      address: a.address,
      city: a.city,
      state: a.state,
      zip: a.zip,
      last: c.last_order_date ?? "",
      lastamt: c.last_order_amount ?? 0,
      y24: salesFor(c, 2024),
      y25: salesFor(c, 2025),
      y26: salesFor(c, 2026),
      lto: c.lifetime_orders ?? 0,
      ltr: c.lifetime_revenue ?? 0,
    });
  }
  finishSheet(ws, 18);

  const date = new Date().toISOString().slice(0, 10);
  return xlsxResponse(wb, `FMG_customers_${date}.xlsx`);
}
