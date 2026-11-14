import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getDemandProfiles } from "@/lib/seasonalDemandServer";

export const runtime = "nodejs";

/**
 * GET → { profiles: { [part]: DemandProfile }, asOf }
 *
 * Seasonal demand for every forecasted product (lib/seasonalDemand.ts), so the
 * Inventory forecast, Dashboard, Purchasing and product pages all project with
 * the same month-by-month numbers.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const profiles = await getDemandProfiles();
    return NextResponse.json(
      { profiles: Object.fromEntries(profiles), asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build the forecast." }, { status: 500 });
  }
}
