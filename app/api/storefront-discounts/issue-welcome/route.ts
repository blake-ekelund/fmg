import { NextResponse } from "next/server";
import { isMintFailure, mintUniqueCode } from "@/lib/storefrontDiscountCodes";

export const runtime = "nodejs";

/**
 * POST /api/storefront-discounts/issue-welcome
 *
 * Mints ONE unique single-use code under the "WELCOME15" unique-code batch and
 * returns it, so a storefront can email a personal welcome code to a brand-new
 * newsletter subscriber. Storefronts authenticate with STOREFRONT_NOTIFY_SECRET
 * (the same shared secret as the ops-notify relay). FMG stays the source of
 * truth for discount codes — the storefront never writes the discount tables.
 *
 * The minting rules (active, in-window, unique-code batch only) live in
 * lib/storefrontDiscountCodes.
 */

const DEFAULT_BATCH = "WELCOME15";

export async function POST(request: Request) {
  const secret = process.env.STOREFRONT_NOTIFY_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { batchCode?: string };
  const minted = await mintUniqueCode(String(body.batchCode ?? DEFAULT_BATCH));
  if (isMintFailure(minted)) {
    return NextResponse.json({ error: minted.error }, { status: minted.status });
  }

  return NextResponse.json({
    code: minted.code,
    kind: minted.kind,
    value: minted.value,
  });
}
