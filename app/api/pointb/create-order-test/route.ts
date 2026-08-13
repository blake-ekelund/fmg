import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  canCreateOrder,
  synapseWriteBlockReason,
  createSynapseOrder,
  type CreateOrderInput,
} from "@/lib/pointb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Point B egress smoke test — fire ONE hand-specified order at Synapse.
 *
 * This is NOT the connector. It sends a single order supplied in the POST body
 * (no Fishbowl poll, no idempotency table) so we can prove create-order works
 * and eyeball the result in Synapse-Anywhere. It is TEST-ONLY by construction:
 * `synapseWriteBlockReason()` fails closed unless SYNAPSE_API_URL points at the
 * Synapse TEST environment, and the write is re-checked inside createSynapseOrder.
 *
 *   GET  → report whether a write is currently allowed (no side effects).
 *   POST → { poNumber, reference, shipTo, details } fires exactly one order.
 *
 * Admin-gated. When the real connector ships and cutover happens, retire this.
 */

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const block = synapseWriteBlockReason();
  return NextResponse.json({
    writeAllowed: canCreateOrder(),
    blockReason: block,
    hint: "POST { poNumber, reference, shipTo:{name,address1,address2?,city,state,postalCode,countryCode?,phone?,email?}, details:[{item,qty,uom?}] } to fire ONE test order.",
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireInternalUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Defense in depth: block here AND inside createSynapseOrder.
    const block = synapseWriteBlockReason();
    if (block) return NextResponse.json({ error: `create-order refused: ${block}` }, { status: 403 });

    if (!canCreateOrder()) {
      return NextResponse.json(
        { error: "Synapse TEST creds are missing (SYNAPSE_TEST_USER / SYNAPSE_TEST_PASS)." },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => null)) as CreateOrderInput | null;
    if (!body) return NextResponse.json({ error: "Provide a JSON body." }, { status: 400 });
    if (!body.poNumber?.trim() || !body.reference?.trim()) {
      return NextResponse.json({ error: "poNumber and reference are required." }, { status: 400 });
    }
    if (!body.shipTo || !Array.isArray(body.details) || body.details.length === 0) {
      return NextResponse.json(
        { error: "shipTo and at least one details line are required." },
        { status: 400 },
      );
    }

    const result = await createSynapseOrder(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "create-order failed." },
      { status: 500 },
    );
  }
}
