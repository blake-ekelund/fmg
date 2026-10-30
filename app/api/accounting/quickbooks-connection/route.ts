import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured } from "@/lib/fishbowl";
import { loadQbConnection } from "@/lib/fishbowlQbMap";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/accounting/quickbooks-connection — how Fishbowl posts to
 * QuickBooks Desktop: default + per-item account mapping, adjustment reasons,
 * posting activity, one real example of each posting type, and alerts.
 * Read-only; cached ~10 min (?fresh=1 re-reads Fishbowl).
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!fishbowlConfigured()) return NextResponse.json({ error: "Fishbowl not connected." }, { status: 500 });
  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await loadQbConnection({ fresh }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
