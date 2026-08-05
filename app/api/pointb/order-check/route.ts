import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, runDataQuery } from "@/lib/fishbowl";
import {
  synapseConfigured,
  feesConfigured,
  getSynapseOrder,
  getOrderFees,
  POINTB_MARKUP,
  type SynapseOrder,
  type OrderFees,
} from "@/lib/pointb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/pointb/order-check?so=24527
 *
 * The founder-facing reconciliation endpoint: given a Fishbowl SO number, pull
 * BOTH sides — Fishbowl (header, line items, shipping lines, tracking) and Point
 * B / Synapse (order-info + order/fees) — and report how they align. Read-only.
 * Admin-gated. Degrades gracefully when the Point B creds aren't set (shows the
 * Fishbowl side and says the Synapse side isn't connected yet).
 */

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const near = (a: number, b: number) => Math.abs(a - b) < 0.02;

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const so = (new URL(request.url).searchParams.get("so") || "").trim();
  if (!so) return NextResponse.json({ error: "Provide a SO number (?so=)." }, { status: 400 });
  if (!/^[A-Za-z0-9._\-]+$/.test(so)) {
    return NextResponse.json({ error: "SO number has unexpected characters." }, { status: 400 });
  }
  if (!fishbowlConfigured()) {
    return NextResponse.json({ error: "Fishbowl isn't connected." }, { status: 500 });
  }

  // ── Fishbowl side ──────────────────────────────────────────────────────
  const headRows = await runDataQuery(
    `SELECT so.id, so.num, so.customerPO, sostatus.name AS status, so.totalPrice,
            so.shipToName, so.shipToCity, so.shipToState, qbclass.name AS channel
     FROM so
     LEFT JOIN sostatus ON so.statusId = sostatus.id
     LEFT JOIN customer ON so.customerId = customer.id
     LEFT JOIN qbclass ON customer.qbClassId = qbclass.id
     WHERE so.num = ${q(so)} LIMIT 1`,
  );
  if (headRows.length === 0) {
    return NextResponse.json({ error: `No Fishbowl order found with SO# ${so}.`, so }, { status: 404 });
  }
  const head = headRows[0] as Record<string, unknown>;
  const soId = num(head.id);

  const [itemRows, shipRows, trackRows] = await Promise.all([
    runDataQuery(
      `SELECT si.soLineItem, si.productNum, si.description, si.qtyOrdered, si.totalPrice,
              st.name AS lineType
       FROM soitem si JOIN soitemtype st ON si.typeId = st.id
       WHERE si.soId = ${soId} AND st.name = 'Sale' ORDER BY si.soLineItem`,
    ),
    runDataQuery(
      `SELECT si.soLineItem, si.totalPrice
       FROM soitem si JOIN soitemtype st ON si.typeId = st.id
       WHERE si.soId = ${soId} AND st.name = 'Shipping' ORDER BY si.soLineItem`,
    ),
    runDataQuery(
      `SELECT shipcarton.trackingNum AS tracking, ship.dateShipped
       FROM shipcarton JOIN ship ON shipcarton.shipId = ship.id
       WHERE ship.soId = ${soId} AND shipcarton.trackingNum IS NOT NULL
             AND shipcarton.trackingNum <> ''`,
    ),
  ]);

  const fbShippingLines = shipRows.map((r) => num((r as Record<string, unknown>).totalPrice));
  const fishbowl = {
    num: String(head.num),
    customerPO: (head.customerPO as string) || "",
    status: (head.status as string) || "",
    channel: (head.channel as string) || "",
    total: num(head.totalPrice),
    shipTo: [head.shipToName, head.shipToCity, head.shipToState].filter(Boolean).join(", "),
    saleLines: itemRows.length,
    saleQty: itemRows.reduce((s, r) => s + num((r as Record<string, unknown>).qtyOrdered), 0),
    shippingLines: fbShippingLines,
    tracking: trackRows.map((r) => String((r as Record<string, unknown>).tracking)),
  };

  // ── Point B / Synapse side ─────────────────────────────────────────────
  let synapse: SynapseOrder | null = null;
  let fees: OrderFees | null = null;
  let pointbError: string | null = null;
  const pointbConnected = synapseConfigured();

  if (pointbConnected) {
    try {
      synapse = await getSynapseOrder(fishbowl.num, fishbowl.customerPO);
      if (synapse && feesConfigured()) {
        fees = await getOrderFees(synapse.orderid).catch(() => null);
      }
    } catch (e) {
      pointbError = e instanceof Error ? e.message : String(e);
    }
  }

  // ── Alignment ──────────────────────────────────────────────────────────
  const expectedFreightLine = fees ? Math.round(fees.totalAmount * POINTB_MARKUP * 100) / 100 : null;
  const alignment = {
    foundInBoth: !!synapse,
    freightMatch:
      expectedFreightLine != null && fbShippingLines.some((v) => near(v, expectedFreightLine)),
    expectedFreightLine,
    synapseTracking: synapse?.plate_details?.map((p) => p.tracking_number).filter(Boolean) ?? [],
    trackingMatch:
      !!synapse &&
      (synapse.plate_details ?? []).some(
        (p) => p.tracking_number && fishbowl.tracking.includes(String(p.tracking_number)),
      ),
    qtyMatch: !!synapse && num(synapse.qty_ship) === fishbowl.saleQty,
  };

  return NextResponse.json({
    so,
    fishbowl,
    synapse: synapse
      ? {
          orderid: synapse.orderid,
          orderType: `${synapse.order_type} (${synapse.order_type_desc})`,
          status: `${synapse.order_status} (${synapse.order_status_desc})`,
          fromFacility: synapse.from_facility,
          carrier: synapse.carrier,
          dateShipped: synapse.date_shipped,
          shippingCost: synapse.shipping_cost,
          shipTo: [synapse.ship_to_name, synapse.ship_to_city, synapse.ship_to_state]
            .filter(Boolean)
            .join(", "),
          qtyShip: synapse.qty_ship,
          lines: synapse.order_details?.length ?? 0,
        }
      : null,
    fees: fees ? { totalAmount: fees.totalAmount, detail: fees.detail } : null,
    alignment,
    connected: { fishbowl: true, synapse: pointbConnected, fees: feesConfigured() },
    pointbError,
  });
}
