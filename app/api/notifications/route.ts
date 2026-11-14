import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import {
  getNotifications,
  getNotificationState,
  markNotificationsSeen,
  updateNotificationPrefs,
  type NotifPrefs,
} from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * The top-bar notification bell, for the signed-in internal user.
 *
 * GET        → { items, unreadCount, prefs }   live aggregate (by the user's prefs)
 * GET ?prefs → { prefs }                        just the toggles (Settings)
 * PATCH      → { ok }                            mark the bell seen now
 * PUT {prefs}→ { ok }                            save the source toggles
 */

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    if (new URL(request.url).searchParams.has("prefs")) {
      const state = await getNotificationState(user.id);
      return NextResponse.json({ prefs: state.prefs });
    }
    return NextResponse.json(await getNotifications(user.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    await markNotificationsSeen(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't update." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { prefs?: Partial<NotifPrefs> };
  const p = body.prefs ?? {};
  const prefs: NotifPrefs = {
    tasks: p.tasks !== false,
    inventory: p.inventory !== false,
    orders: p.orders !== false,
    reviews: p.reviews !== false,
  };
  try {
    await updateNotificationPrefs(user.id, prefs);
    return NextResponse.json({ ok: true, prefs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 500 });
  }
}
