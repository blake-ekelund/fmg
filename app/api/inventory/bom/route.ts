import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured } from "@/lib/fishbowl";
import { loadBomUniverse } from "@/lib/fishbowlBom";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/inventory/bom — every active Fishbowl BOM (one per product), plus
 * stock by location, open PO quantities and vendor terms for every part on
 * them. Feeds the product page's BOM tab and the Purchasing planner, which do
 * their planning math client-side (lib/bomPlan.ts).
 *
 * Cached ~5 minutes server-side; ?fresh=1 re-reads Fishbowl. Read-only.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!fishbowlConfigured()) {
    return NextResponse.json(
      { error: "Fishbowl not connected — set FISHBOWL_API_URL / FISHBOWL_USER / FISHBOWL_PASS." },
      { status: 500 },
    );
  }

  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await loadBomUniverse({ fresh }));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
