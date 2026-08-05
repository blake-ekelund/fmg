import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { synapseConfigured, feesConfigured, getRecentShippedOrders, getOrderFees } from "@/lib/pointb";
import { KNOWN_FEE_CODES } from "@/lib/pointbFieldMap";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/pointb/field-check
 *
 * Drift detection for the daily field-map review: sample a few recent Point B
 * orders, collect the charge codes their `order/fees` returns, and flag any code
 * NOT in the known contract (KNOWN_FEE_CODES) — i.e. Point B added a new fee type
 * that would change the freight math. Read-only, admin-gated, always JSON.
 */
export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!synapseConfigured() || !feesConfigured()) {
      return NextResponse.json({ connected: false });
    }

    const ships = (await getRecentShippedOrders(30)).slice(0, 5);
    const seen = new Map<number, string>(); // code → description (as Point B currently sends it)
    let sampled = 0;

    for (const s of ships) {
      const fees = await getOrderFees(s.orderid).catch(() => null);
      if (!fees) continue;
      sampled++;
      for (const d of fees.detail) if (!seen.has(d.code)) seen.set(d.code, d.description);
    }

    const feeCodes = Array.from(seen.entries())
      .map(([code, description]) => ({ code, description, known: code in KNOWN_FEE_CODES }))
      .sort((a, b) => a.code - b.code);

    return NextResponse.json({
      connected: true,
      sampled,
      feeCodes,
      unknownCount: feeCodes.filter((f) => !f.known).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Field check failed." },
      { status: 500 },
    );
  }
}
