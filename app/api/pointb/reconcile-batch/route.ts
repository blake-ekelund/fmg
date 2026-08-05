import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, withFishbowl } from "@/lib/fishbowl";
import { synapseConfigured, getRecentShippedOrders, type ShipSummary } from "@/lib/pointb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/pointb/reconcile-batch
 *
 * The "Run" batch reconciliation: the most recent orders per Fishbowl status,
 * each matched against Point B / Synapse and flagged aligned / review / pending.
 * Fast by design — ONE Fishbowl session for the order list, ONE Synapse call for
 * all recent shipments (matched by SO# = Synapse po). Read-only, admin-gated,
 * always returns JSON.
 */

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const PER_STATUS = 10;

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!fishbowlConfigured()) {
      return NextResponse.json({ error: "Fishbowl isn't connected." }, { status: 500 });
    }

    // ── Fishbowl: recent issued (non-estimate) orders, with shipping + tracking
    const rows = await withFishbowl((query) =>
      query(
        `SELECT so.num, sostatus.name AS status, qbclass.name AS channel,
          (SELECT GROUP_CONCAT(si.totalPrice)
             FROM soitem si JOIN soitemtype st ON si.typeId = st.id
             WHERE si.soId = so.id AND st.name = 'Shipping') AS shipLines,
          (SELECT GROUP_CONCAT(DISTINCT sc.trackingNum)
             FROM shipcarton sc JOIN ship sh ON sc.shipId = sh.id
             WHERE sh.soId = so.id AND sc.trackingNum IS NOT NULL AND sc.trackingNum <> '') AS tracking
         FROM so
         LEFT JOIN sostatus ON so.statusId = sostatus.id
         LEFT JOIN customer ON so.customerId = customer.id
         LEFT JOIN qbclass ON customer.qbClassId = qbclass.id
         WHERE so.dateIssued IS NOT NULL AND so.statusId <> 10
         ORDER BY so.id DESC LIMIT 80`,
      ),
    );

    // ── Point B: one call for all recent shipments (map by po = SO#) ────────
    let shipMap = new Map<string, ShipSummary>();
    let pointbError: string | null = null;
    const pointbConnected = synapseConfigured();
    if (pointbConnected) {
      try {
        const ships = await getRecentShippedOrders(75);
        shipMap = new Map(ships.map((s) => [s.po, s]));
      } catch (e) {
        pointbError = e instanceof Error ? e.message : String(e);
      }
    }

    const split = (s: string | null) =>
      (s || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

    // ── Group by status (last N per status), match + flag ───────────────────
    const groups: Record<string, ReturnType<typeof buildRow>[]> = {};
    for (const raw of rows) {
      const r = raw as Record<string, unknown>;
      const status = (r.status as string) || "Unknown";
      (groups[status] ??= []);
      if (groups[status].length >= PER_STATUS) continue;
      groups[status].push(buildRow(r, shipMap, split));
    }

    return NextResponse.json({
      groups: Object.entries(groups).map(([status, orders]) => ({
        status,
        orders,
        aligned: orders.filter((o) => o.state === "aligned").length,
        total: orders.length,
      })),
      connected: { fishbowl: true, synapse: pointbConnected },
      pointbError,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reconciliation failed." },
      { status: 500 },
    );
  }
}

function buildRow(
  r: Record<string, unknown>,
  shipMap: Map<string, ShipSummary>,
  split: (s: string | null) => string[],
) {
  const numStr = String(r.num);
  const fbTracking = split(r.tracking as string);
  const fbShipLines = split(r.shipLines as string).map((x) => num(x));
  const s = shipMap.get(numStr) ?? null;
  const trackingMatch = !!s && s.tracking.some((t) => fbTracking.includes(t));
  // aligned: Point B shipped it AND the tracking agrees. review: shipped but
  // tracking differs. pending: not (yet) shipped at Point B — expected for
  // issued/in-progress orders.
  const state: "aligned" | "review" | "pending" = s
    ? trackingMatch
      ? "aligned"
      : "review"
    : "pending";
  return {
    num: numStr,
    channel: (r.channel as string) || "",
    fbTracking,
    fbShipLines,
    synapse: s
      ? { status: s.status, tracking: s.tracking, shippingCost: s.shippingCost, dateShipped: s.dateShipped }
      : null,
    state,
  };
}
