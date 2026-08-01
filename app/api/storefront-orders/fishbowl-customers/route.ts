import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, runDataQuery } from "@/lib/fishbowl";

export const runtime = "nodejs";

/**
 * GET /api/storefront-orders/fishbowl-customers?q=general
 *
 * Search ACTIVE Fishbowl customers by name — live against Fishbowl, because
 * the customer_contact_summary view only carries customers with completed
 * sales (estimate-only customers like fresh Faire retailers are missing
 * there). Used by the order-detail "Assign customer" picker for flagged
 * marketplace orders. Search-on-submit only — every call costs one brief
 * Fishbowl license seat, so no per-keystroke typeahead.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!fishbowlConfigured()) {
    return NextResponse.json({ error: "Fishbowl isn't configured." }, { status: 500 });
  }

  const raw = new URL(request.url).searchParams.get("q") ?? "";
  // Server-controlled SQL only: allow-list the characters, escape quotes.
  const q = raw.replace(/[^\w\s&'.,-]/g, "").trim().slice(0, 40);
  if (q.length < 2) return NextResponse.json({ customers: [] });
  const like = `%${q.replace(/'/g, "''")}%`;

  try {
    const rows = await runDataQuery(
      `SELECT id, name FROM customer WHERE activeFlag = 1 AND name LIKE '${like}' ORDER BY name LIMIT 20`,
    );
    return NextResponse.json({
      customers: rows.map((r) => ({ id: String(r.id), name: String(r.name) })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
