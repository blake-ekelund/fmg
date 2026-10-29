import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, withFishbowl } from "@/lib/fishbowl";
import { inventoryValuationSql } from "@/lib/fishbowlQueries";
import { ACCOUNTS, loadInventoryJournal, monthRange } from "@/lib/inventoryJournal";

export const runtime = "nodejs";
// The item detail for one month takes ~40s in Fishbowl.
export const maxDuration = 120;

/**
 * GET /api/accounting/inventory-journal
 *   → { months: JournalMonth[], accounts } — the monthly Inventory entry for
 *     QuickBooks Online since Jan 2026 (cached ~10 min; ?fresh=1 re-reads).
 * GET /api/accounting/inventory-journal?month=YYYY-MM
 *   → { month, items } — that month's item-by-item roll-forward; its
 *     other_value_out column sums to the month's entry.
 * Read-only.
 */
const detailCache = new Map<string, { at: number; items: Record<string, unknown>[] }>();
const DETAIL_MS = 10 * 60_000;

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!fishbowlConfigured()) return NextResponse.json({ error: "Fishbowl not connected." }, { status: 500 });

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const fresh = url.searchParams.get("fresh") === "1";

  try {
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
      const hit = detailCache.get(month);
      if (!fresh && hit && Date.now() - hit.at < DETAIL_MS) return NextResponse.json({ month, items: hit.items });
      const [start, end] = monthRange(month);
      const items = await withFishbowl((q) => q(inventoryValuationSql(start, end)));
      detailCache.set(month, { at: Date.now(), items });
      return NextResponse.json({ month, items });
    }
    return NextResponse.json({ months: await loadInventoryJournal({ fresh }), accounts: ACCOUNTS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
