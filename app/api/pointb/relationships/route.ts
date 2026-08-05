import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, withFishbowl } from "@/lib/fishbowl";
import {
  synapseConfigured,
  feesConfigured,
  getSynapseOrderRaw,
  getOrderFees,
} from "@/lib/pointb";
import { FIELD_LOOKUP } from "@/lib/pointbFieldMap";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/pointb/relationships?so=24545
 *
 * Every field Point B returns for a real order, each annotated with the Fishbowl
 * field it maps to and who pushes it — the live version of the field contract.
 * Read-only, admin-gated, always JSON.
 */
const qq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!fishbowlConfigured()) return NextResponse.json({ error: "Fishbowl isn't connected." }, { status: 500 });

    const so = (new URL(request.url).searchParams.get("so") || "").trim();
    if (!so) return NextResponse.json({ error: "Provide a SO number (?so=)." }, { status: 400 });
    if (!/^[A-Za-z0-9._\-]+$/.test(so)) {
      return NextResponse.json({ error: "SO number has unexpected characters." }, { status: 400 });
    }

    // Fishbowl: the SO's customer PO (needed to look up Synapse).
    const headRows = await withFishbowl((query) =>
      query(`SELECT so.num, so.customerPO FROM so WHERE so.num = ${qq(so)} LIMIT 1`),
    );
    if (headRows.length === 0) {
      return NextResponse.json({ error: `No Fishbowl order found with SO# ${so}.`, so }, { status: 404 });
    }
    const head = headRows[0] as Record<string, unknown>;
    const customerPO = (head.customerPO as string) || "";

    if (!synapseConfigured()) {
      return NextResponse.json({ so, customerPO, connected: false });
    }

    const { order, shipped } = await getSynapseOrderRaw(so, customerPO);
    if (!order) {
      return NextResponse.json({ so, customerPO, connected: true, found: false });
    }

    // Flatten the scalar fields; annotate with the mapping.
    const fields = Object.entries(order)
      .filter(([, v]) => v === null || (typeof v !== "object" && !Array.isArray(v)))
      .map(([field, v]) => {
        const look = FIELD_LOOKUP[field];
        return {
          field,
          value: v == null ? null : String(v),
          fishbowl: look?.fishbowl ?? null,
          owner: look?.owner ?? null,
          note: look?.note ?? null,
          passthru: /_pass_thru_/.test(field),
        };
      });

    const tracking = Array.isArray(shipped?.plate_details)
      ? ((shipped!.plate_details as Array<{ tracking_number?: string | null }>)
          .map((p) => p.tracking_number)
          .filter(Boolean) as string[])
      : [];

    const fees = feesConfigured() ? await getOrderFees(num(order.orderid)).catch(() => null) : null;

    return NextResponse.json({
      so,
      customerPO,
      connected: true,
      found: true,
      orderid: num(order.orderid),
      lineCount: Array.isArray(order.order_details) ? (order.order_details as unknown[]).length : 0,
      tracking,
      fields,
      fees: fees ? { totalAmount: fees.totalAmount, detail: fees.detail } : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Relationships lookup failed." },
      { status: 500 },
    );
  }
}
