import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, withFishbowl } from "@/lib/fishbowl";
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
 * B / Synapse (order-info + order/fees) — and report how they align. Read-only,
 * admin-gated. The whole handler is wrapped so it ALWAYS returns JSON (never an
 * empty body), and all Fishbowl queries share ONE session (one license seat).
 */

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const near = (a: number, b: number) => Math.abs(a - b) < 0.02;

export async function GET(request: Request) {
  try {
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

    // ── Fishbowl side — all queries in ONE session (one license seat) ──────
    const fb = await withFishbowl(async (query) => {
      const headRows = await query(
        `SELECT so.id, so.num, so.customerPO, sostatus.name AS status, so.totalPrice,
                so.shipToName, so.shipToCity, so.shipToState, qbclass.name AS channel
         FROM so
         LEFT JOIN sostatus ON so.statusId = sostatus.id
         LEFT JOIN customer ON so.customerId = customer.id
         LEFT JOIN qbclass ON customer.qbClassId = qbclass.id
         WHERE so.num = ${q(so)} LIMIT 1`,
      );
      if (headRows.length === 0) return null;
      const head = headRows[0] as Record<string, unknown>;
      const soId = num(head.id);
      const items = await query(
        `SELECT si.qtyOrdered FROM soitem si JOIN soitemtype st ON si.typeId = st.id
         WHERE si.soId = ${soId} AND st.name = 'Sale'`,
      );
      const ships = await query(
        `SELECT si.totalPrice FROM soitem si JOIN soitemtype st ON si.typeId = st.id
         WHERE si.soId = ${soId} AND st.name = 'Shipping' ORDER BY si.soLineItem`,
      );
      const tracks = await query(
        `SELECT shipcarton.trackingNum AS tracking
         FROM shipcarton JOIN ship ON shipcarton.shipId = ship.id
         WHERE ship.soId = ${soId} AND shipcarton.trackingNum IS NOT NULL
               AND shipcarton.trackingNum <> ''`,
      );
      return { head, items, ships, tracks };
    });

    if (!fb) {
      return NextResponse.json({ error: `No Fishbowl order found with SO# ${so}.`, so }, { status: 404 });
    }

    const fbShippingLines = fb.ships.map((r) => num((r as Record<string, unknown>).totalPrice));
    const fishbowl = {
      num: String(fb.head.num),
      customerPO: (fb.head.customerPO as string) || "",
      status: (fb.head.status as string) || "",
      channel: (fb.head.channel as string) || "",
      total: num(fb.head.totalPrice),
      shipTo: [fb.head.shipToName, fb.head.shipToCity, fb.head.shipToState].filter(Boolean).join(", "),
      saleLines: fb.items.length,
      saleQty: fb.items.reduce((s, r) => s + num((r as Record<string, unknown>).qtyOrdered), 0),
      shippingLines: fbShippingLines,
      tracking: fb.tracks.map((r) => String((r as Record<string, unknown>).tracking)),
    };

    // ── Point B / Synapse side (optional — never blocks the Fishbowl view) ─
    let synapse: SynapseOrder | null = null;
    let fees: OrderFees | null = null;
    let pointbError: string | null = null;
    const pointbConnected = synapseConfigured();
    if (pointbConnected) {
      try {
        synapse = await getSynapseOrder(fishbowl.num, fishbowl.customerPO);
        if (synapse && feesConfigured()) fees = await getOrderFees(synapse.orderid).catch(() => null);
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
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Order check failed." },
      { status: 500 },
    );
  }
}
