import { supabaseServer } from "@/lib/supabaseServer";
import { resolvePortalAgency } from "@/lib/email/server-auth";
import { stageOf } from "@/lib/orderStage";
import { resolveCarrier, carrierLabel, trackingUrl } from "@/lib/tracking";
import {
  MONEY_FMT,
  addBrandedSheet,
  brandWorkbook,
  finishSheet,
  generatedLabel,
  xlsxResponse,
} from "@/lib/portalExport";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/portal/orders/export?q=<search>&stage=open,completed
 *
 * Streams an .xlsx of the rep's own orders with two sheets:
 *   • "Orders"     — one row per order: status, ship-to, total, tracking (a
 *                    clickable carrier link), carrier.
 *   • "Line Items" — one row per line: item, description, qty, unit, total.
 *
 * Agency-scoped exactly like the orders API — the order set is the agency's
 * customers, filtered by the same optional search and (portal) stage as the
 * on-screen list. Read-only.
 */

const ID_CHUNK = 200;
const PAGE = 1000;

type PortalStage = "open" | "completed" | "cancelled";
function portalStage(status: string | null): PortalStage {
  const s = stageOf(status);
  return s === "estimate" ? "open" : s;
}
const STAGE_TITLE: Record<PortalStage, string> = {
  open: "Open",
  completed: "Completed",
  cancelled: "Cancelled",
};

type OrderRow = {
  id: number;
  num: string | null;
  customerid: string | null;
  customerpo: string | null;
  status: string | null;
  totalprice: number | null;
  datecreated: string | null;
  dateissued: string | null;
  datecompleted: string | null;
  shiptocity: string | null;
  shiptostate: string | null;
};

type ItemRow = {
  soid: number;
  solineitem: number | null;
  productnum: string | null;
  description: string | null;
  qtyordered: number | null;
  qtyfulfilled: number | null;
  totalprice: number | null;
  typename: string | null;
};

type ShipRow = { soid: number; carrier: string | null; tracking_num: string | null };

const effectiveDate = (o: OrderRow) => o.datecompleted ?? o.dateissued ?? o.datecreated ?? null;

/**
 * Page through a table for a set of ids (chunked to keep the IN() list small),
 * returning every matching row. `orFilter` applies an optional PostgREST `or=`
 * search on top of the id filter.
 */
async function fetchAll<T>(
  table: string,
  cols: string,
  idField: string,
  ids: (string | number)[],
  orFilter?: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK) as string[];
    let from = 0;
    for (;;) {
      let query = supabaseServer.from(table).select(cols).in(idField, slice);
      if (orFilter) query = query.or(orFilter);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  return out;
}

export async function GET(request: Request) {
  const rep = await resolvePortalAgency(request);
  if (!rep) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const stageParam = (params.get("stage") ?? "").trim();
  const wantStages = new Set(
    stageParam ? (stageParam.split(",").filter(Boolean) as PortalStage[]) : [],
  );

  const agency = String(rep.agencyCode);

  const { data: custData, error: custErr } = await supabaseServer
    .from("customer_summary")
    .select("customerid, name")
    .eq("agency_code", agency);
  if (custErr) return Response.json({ error: custErr.message }, { status: 500 });
  const nameById = new Map(
    ((custData ?? []) as { customerid: string; name: string }[]).map((r) => [r.customerid, r.name]),
  );
  const ids = [...nameById.keys()];
  if (ids.length === 0) return Response.json({ error: "No orders to export." }, { status: 404 });

  // Orders (optionally filtered by search), then narrow by portal stage in-app.
  const safe = q.replace(/[%,()]/g, "");
  const orFilter =
    q && safe
      ? `num.ilike.%${safe}%,customerpo.ilike.%${safe}%,shiptoname.ilike.%${safe}%`
      : undefined;
  let orders = await fetchAll<OrderRow>(
    "sales_orders_raw",
    "id, num, customerid, customerpo, status, totalprice, datecreated, dateissued, datecompleted, shiptocity, shiptostate",
    "customerid",
    ids,
    orFilter,
  );
  if (wantStages.size > 0) orders = orders.filter((o) => wantStages.has(portalStage(o.status)));
  orders.sort((a, b) => {
    const da = effectiveDate(a) ?? "";
    const db = effectiveDate(b) ?? "";
    if (da !== db) return da < db ? 1 : -1;
    return b.id - a.id;
  });

  const orderIds = orders.map((o) => o.id);

  // Line items + shipments for exactly those orders.
  const [items, ships] = await Promise.all([
    fetchAll<ItemRow>(
      "so_items_raw",
      "soid, solineitem, productnum, description, qtyordered, qtyfulfilled, totalprice, typename",
      "soid",
      orderIds,
    ),
    fetchAll<ShipRow>("so_shipments_raw", "soid, carrier, tracking_num", "soid", orderIds),
  ]);

  // Tracking per order → number(s) + a carrier deep link.
  const trackingBySo = new Map<number, { nums: string[]; url: string | null; carrier: string }>();
  for (const s of ships) {
    const num = (s.tracking_num ?? "").trim();
    if (!num) continue;
    const id = resolveCarrier(s.carrier, num);
    const entry = trackingBySo.get(s.soid) ?? { nums: [], url: null, carrier: "" };
    entry.nums.push(num);
    if (!entry.url) entry.url = trackingUrl(id, num);
    if (!entry.carrier && id) entry.carrier = carrierLabel(id);
    trackingBySo.set(s.soid, entry);
  }

  const itemsBySo = new Map<number, ItemRow[]>();
  for (const it of items) {
    const list = itemsBySo.get(it.soid) ?? [];
    list.push(it);
    itemsBySo.set(it.soid, list);
  }

  // Customer contact/address for the orders' accounts (agency-scoped already —
  // these are the agency's own customers).
  type Contact = {
    customerid: string;
    email: string | null;
    phone: string | null;
    billto_address: string | null;
    billto_city: string | null;
    billto_state: string | null;
    billto_zip: string | null;
  };
  const contactById = new Map<string, Contact>();
  const custIds = [...new Set(orders.map((o) => o.customerid).filter(Boolean))] as string[];
  for (let i = 0; i < custIds.length; i += ID_CHUNK) {
    const { data } = await supabaseServer
      .from("customer_contact_summary")
      .select("customerid, email, phone, billto_address, billto_city, billto_state, billto_zip")
      .in("customerid", custIds.slice(i, i + ID_CHUNK));
    for (const c of (data ?? []) as Contact[]) contactById.set(c.customerid, c);
  }
  const billTo = (id: string | null) => {
    const c = id ? contactById.get(id) : undefined;
    if (!c) return "";
    return [c.billto_address, c.billto_city, c.billto_state, c.billto_zip]
      .filter(Boolean)
      .join(", ");
  };

  // ── Build the branded workbook ──
  const wb = brandWorkbook();
  const stamp = generatedLabel();

  const summary = addBrandedSheet(wb, {
    name: "Orders",
    title: "Orders",
    subtitle: `${orders.length.toLocaleString()} orders  ·  ${stamp}`,
    columns: [
      { header: "Order #", key: "num", width: 12 },
      { header: "PO", key: "po", width: 16 },
      { header: "Customer", key: "customer", width: 32 },
      { header: "Email", key: "email", width: 26 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Bill To", key: "billto", width: 34 },
      { header: "Status", key: "status", width: 12 },
      { header: "Ship To", key: "shipto", width: 24 },
      { header: "Date", key: "date", width: 13 },
      { header: "Total", key: "total", width: 13, numFmt: MONEY_FMT },
      { header: "Carrier", key: "carrier", width: 10 },
      { header: "Tracking #", key: "tracking", width: 30 },
    ],
  });

  for (const o of orders) {
    const t = trackingBySo.get(o.id);
    const c = o.customerid ? contactById.get(o.customerid) : undefined;
    const row = summary.addRow({
      num: o.num ?? "",
      po: o.customerpo ?? "",
      customer: o.customerid ? (nameById.get(o.customerid) ?? o.customerid) : "",
      email: c?.email ?? "",
      phone: c?.phone ?? "",
      billto: billTo(o.customerid),
      status: STAGE_TITLE[portalStage(o.status)],
      shipto: [o.shiptocity, o.shiptostate].filter(Boolean).join(", "),
      date: effectiveDate(o) ?? "",
      total: o.totalprice ?? 0,
      carrier: t?.carrier ?? "",
      tracking: t ? t.nums.join(", ") : "",
    });
    // Make the tracking cell a clickable carrier link when we have a URL.
    if (t?.url) {
      const cell = row.getCell("tracking");
      cell.value = { text: t.nums.join(", "), hyperlink: t.url };
      cell.font = { name: "Arial", size: 10, color: { argb: "FF1D4ED8" }, underline: true };
    }
  }
  finishSheet(summary, 12);

  const detail = addBrandedSheet(wb, {
    name: "Line Items",
    title: "Line Items",
    subtitle: stamp,
    columns: [
      { header: "Order #", key: "num", width: 12 },
      { header: "Customer", key: "customer", width: 34 },
      { header: "Line", key: "line", width: 6 },
      { header: "Type", key: "type", width: 12 },
      { header: "Item #", key: "item", width: 14 },
      { header: "Description", key: "desc", width: 48 },
      { header: "Qty Ordered", key: "qty", width: 12 },
      { header: "Qty Shipped", key: "ship", width: 12 },
      { header: "Unit Price", key: "unit", width: 13, numFmt: MONEY_FMT },
      { header: "Total", key: "total", width: 13, numFmt: MONEY_FMT },
    ],
  });

  for (const o of orders) {
    const list = (itemsBySo.get(o.id) ?? []).sort(
      (a, b) => (a.solineitem ?? 0) - (b.solineitem ?? 0),
    );
    const customer = o.customerid ? (nameById.get(o.customerid) ?? o.customerid) : "";
    for (const it of list) {
      const qty = it.qtyordered ?? 0;
      const total = it.totalprice ?? 0;
      detail.addRow({
        num: o.num ?? "",
        customer,
        line: it.solineitem ?? "",
        type: it.typename ?? "",
        item: it.productnum ?? "",
        desc: it.description ?? "",
        qty,
        ship: it.qtyfulfilled ?? 0,
        unit: qty > 0 ? total / qty : "",
        total,
      });
    }
  }
  finishSheet(detail, 10);

  const date = new Date().toISOString().slice(0, 10);
  return xlsxResponse(wb, `FMG_orders_${date}.xlsx`);
}
