import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured } from "@/lib/fishbowl";
import { loadPoDefaults } from "@/lib/fishbowlPoDefaults";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/inventory/po-defaults — each vendor's usual PO header, from its
 * most recent Fishbowl PO, for building Fishbowl-ready PO files on the
 * Purchasing page. Read-only; cached ~10 minutes (?fresh=1 to re-read).
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!fishbowlConfigured()) {
    return NextResponse.json({ error: "Fishbowl not connected." }, { status: 500 });
  }
  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await loadPoDefaults({ fresh }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
