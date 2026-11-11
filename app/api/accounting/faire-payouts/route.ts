import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAllowedPaths } from "@/components/navConfig";
import type { UserRole } from "@/components/UserContext";
import {
  FAIRE_PAYOUTS_PATH,
  getFairePayout,
  listFairePayouts,
  setFairePayoutsInQbo,
  syncFairePayoutOrders,
} from "@/lib/fairePayoutsStore";

export const runtime = "nodejs";
// Refresh pulls from Faire (seconds when incremental; up to ~90s on a first backfill).
export const maxDuration = 300;

/**
 * Accounting → Faire Payouts.
 *
 * GET                       → { ready, payouts, lastSyncedAt }  (newest first)
 * GET ?date=YYYY-MM-DD       → { payout }  (one payout, for its own page)
 * POST ?refresh=1            → sync paid orders from Faire now (same as the hourly cron)
 * PATCH { dates[], entered } → tick / untick "Entered in QBO" for those payouts
 *
 * Owner/admin (gated like the page).
 */

async function authorize(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return null;
  return getAllowedPaths(user.access as UserRole).includes(FAIRE_PAYOUTS_PATH) ? user : null;
}

export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const date = new URL(request.url).searchParams.get("date");
    if (date) {
      const payout = await getFairePayout(date);
      if (!payout) return NextResponse.json({ error: "No Faire payout on that day." }, { status: 404 });
      return NextResponse.json({ payout });
    }
    return NextResponse.json(await listFairePayouts());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load payouts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (new URL(request.url).searchParams.get("refresh") !== "1") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  try {
    return NextResponse.json(await syncFairePayoutOrders());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't refresh from Faire." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { dates?: unknown; entered?: unknown };
  if (!Array.isArray(body.dates) || typeof body.entered !== "boolean") {
    return NextResponse.json({ error: "Send { dates: [...], entered: true|false }." }, { status: 400 });
  }
  try {
    await setFairePayoutsInQbo(body.dates.map(String), body.entered, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save that." }, { status: 500 });
  }
}
