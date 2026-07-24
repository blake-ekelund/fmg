import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { fetchOpenOrderCustomerIds } from "@/lib/orderStage";
import { properCase } from "@/lib/textCase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/portal/customers/export?report=<report>
 *
 * Streams an .xlsx of the rep's own accounts. `report` picks the slice:
 *   not-ordered — ordered before but nothing yet in 2026 (and no live order)
 *   at-risk     — 6–12 months since last order
 *   churned     — 12+ months since last order
 *   all         — the whole book (default)
 *
 * Agency-scoped exactly like the customers API. An account with an open
 * estimate/order counts as active — the same rule the list and dashboard use —
 * so "not-ordered" never nags someone who already has an order in flight.
 * Read-only.
 */

const ACTIVE_DAYS = 180;
const CHURN_DAYS = 365;

type Report = "not-ordered" | "at-risk" | "churned" | "all";

const REPORTS: Record<Report, { title: string; sheet: string; file: string }> = {
  "not-ordered": {
    title: "Accounts that haven't ordered in 2026",
    sheet: "Not ordered 2026",
    file: "accounts_not_ordered_2026",
  },
  "at-risk": {
    title: "At-risk accounts (6–12 months quiet)",
    sheet: "At risk",
    file: "accounts_at_risk",
  },
  churned: {
    title: "Churned accounts (12+ months quiet)",
    sheet: "Churned",
    file: "accounts_churned",
  },
  all: { title: "All accounts", sheet: "Accounts", file: "accounts" },
};

type Status = "active" | "at_risk" | "churned" | "none";

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

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

function statusOf(r: Row, hasOpen: boolean): Status {
  if (hasOpen) return "active";
  const d = daysSince(r.last_order_date);
  if (d === null) return "none";
  if (d <= ACTIVE_DAYS) return "active";
  if (d <= CHURN_DAYS) return "at_risk";
  return "churned";
}

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  at_risk: "At risk",
  churned: "Churned",
  none: "No orders",
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

  const withStatus = rows.map((r) => ({ r, status: statusOf(r, openIds.has(r.customerid)) }));

  let selected = withStatus;
  if (report === "not-ordered") {
    // Ordered before, no completed 2026 sales, and nothing live in flight.
    selected = withStatus.filter(
      ({ r, status }) =>
        r.last_order_date != null && (r.sales_2026 ?? 0) === 0 && status !== "active",
    );
  } else if (report === "at-risk") {
    selected = withStatus.filter(({ status }) => status === "at_risk");
  } else if (report === "churned") {
    selected = withStatus.filter(({ status }) => status === "churned");
  }

  // Biggest opportunity first: last year's spend for lapsed reports, else 2026.
  const rank = (x: { r: Row }) =>
    report === "all" ? x.r.sales_2026 ?? 0 : x.r.sales_2025 ?? 0;
  selected.sort((a, b) => rank(b) - rank(a));

  // ── Workbook ──
  const wb = new ExcelJS.Workbook();
  wb.creator = "FMG Rep Portal";
  const money = "$#,##0.00";
  const ws = wb.addWorksheet(meta.sheet, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Customer", key: "name", width: 34 },
    { header: "ID", key: "id", width: 12 },
    { header: "Channel", key: "channel", width: 16 },
    { header: "State", key: "state", width: 8 },
    { header: "Status", key: "status", width: 10 },
    { header: "Last Order", key: "last", width: 12 },
    { header: "Last Order $", key: "lastAmt", width: 13, style: { numFmt: money } },
    { header: "2023", key: "y23", width: 12, style: { numFmt: money } },
    { header: "2024", key: "y24", width: 12, style: { numFmt: money } },
    { header: "2025", key: "y25", width: 12, style: { numFmt: money } },
    { header: "2026 YTD", key: "y26", width: 12, style: { numFmt: money } },
    { header: "Lifetime Orders", key: "lo", width: 14 },
    { header: "Lifetime Revenue", key: "lr", width: 16, style: { numFmt: money } },
  ];

  for (const { r, status } of selected) {
    ws.addRow({
      name: properCase(r.name),
      id: r.customerid,
      channel: r.channel ?? "",
      state: r.bill_to_state ?? "",
      status: STATUS_LABEL[status],
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
  ws.getRow(1).font = { bold: true };

  // A title/context row above the table would break the frozen header, so the
  // sheet name carries the report; the filename does too.
  const buf = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${meta.file}_${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
