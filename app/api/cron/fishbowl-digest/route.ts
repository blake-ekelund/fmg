import { NextResponse } from "next/server";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import { getAuthUser } from "@/lib/email/server-auth";
import { sendEmail } from "@/lib/email/send";
import { orderRef, type StorefrontOrder } from "@/lib/storefrontOrder";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/fishbowl-digest
 *
 * Twice-daily internal digest: emails Blake the list of sales orders that
 * still need to be keyed into Fishbowl (fishbowl_entered_at IS NULL, not
 * cancelled). Sends from the first connected Outlook account via Graph —
 * the same sender the automations cron falls back to.
 *
 * Scheduling: Vercel crons run in UTC, and Eastern shifts with DST, so
 * vercel.json fires this at the four UTC hours that cover 6 AM / 3 PM ET
 * across the year (10,11,19,20). This handler then gates to the exact local
 * times, so it sends at precisely 6 AM and 3 PM Eastern year-round with no
 * seasonal maintenance. `?dry=1` previews without sending; `?force=1` sends
 * now regardless of the hour (both require a signed-in portal user).
 */

const DIGEST_TO: { address: string; name?: string }[] = [
  { address: "blake.ekelund@fragrancemarketinggroup.com", name: "Blake Ekelund" },
  { address: "jekelund@fragrancemarketinggroup.com", name: "Julie Ekelund" },
];
const DIGEST_TZ = "America/New_York";
const SEND_HOURS = new Set([6, 15]); // 6 AM and 3 PM Eastern

// Owner for the auto-created "Enter <SO> into Fishbowl" tasks
// (tasks.owner = profiles.first_name). Change to reassign.
const TASK_OWNER = "Blake";

/** Current hour (0–23) in a named timezone, DST-aware. */
function hourInTz(tz: string): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return Number(h) % 24;
}

const money = (n?: number | null) =>
  n == null ? "—" : `$${Number(n).toFixed(2)}`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(
  orders: StorefrontOrder[],
  origin: string,
  label: string,
): string {
  const rows = orders
    .map((o) => {
      const ref = orderRef(o);
      const placed = new Date(o.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const buyer = escapeHtml(
        String(o.business_name || o.contact_name || o.email || "Guest"),
      );
      const href = `${origin}/storefronts/purchases/${o.id}`;
      const td = "padding:6px 10px;border-bottom:1px solid #eee;";
      return `<tr>
  <td style="${td}font-family:monospace;"><a href="${href}" style="color:#4f46e5;text-decoration:none;">${ref}</a></td>
  <td style="${td}color:#555;white-space:nowrap;">${placed}</td>
  <td style="${td}color:#555;">${o.channel ?? "—"}</td>
  <td style="${td}">${buyer}</td>
  <td style="${td}text-align:right;white-space:nowrap;">${money(o.total)}</td>
</tr>`;
    })
    .join("");

  const th =
    "padding:6px 10px;border-bottom:2px solid #eee;text-transform:uppercase;letter-spacing:.04em;";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;">
  <h2 style="margin:0 0 4px;">Sales orders needing Fishbowl entry</h2>
  <p style="margin:0 0 16px;color:#666;font-size:13px;">${label} · ${orders.length} order${orders.length === 1 ? "" : "s"}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <thead>
      <tr style="text-align:left;color:#888;font-size:11px;">
        <th style="${th}">Order</th>
        <th style="${th}">Placed</th>
        <th style="${th}">Channel</th>
        <th style="${th}">Buyer</th>
        <th style="${th}text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin:16px 0 0;font-size:13px;">
    <a href="${origin}/storefronts/purchases" style="color:#4f46e5;">Open Purchases →</a>
  </p>
</div>`;
}

export async function GET(request: Request) {
  // Auth: Vercel cron (Bearer CRON_SECRET) or a signed-in portal user (so
  // ?dry=1 / ?force=1 are testable from the browser).
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";

  const hour = hourInTz(DIGEST_TZ);
  if (!dry && !force && !SEND_HOURS.has(hour)) {
    return NextResponse.json({ skipped: true, hour, tz: DIGEST_TZ });
  }

  const admin = wholesalePortalAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Wholesale portal not connected (WHOLESALE_SUPABASE_URL / SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("orders")
    .select(
      "id, number, store, channel, business_name, contact_name, email, total, created_at, fishbowl_entered_at, status",
    )
    .is("fishbowl_entered_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    // Most likely the wholesale migration hasn't been run yet (no
    // fishbowl_entered_at column) — surface it rather than silently no-op.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // "Requires Fishbowl entry" = not yet entered (queried above) and not
  // cancelled. Filtering cancelled in JS keeps null-status rows, which a
  // PostgREST `neq` filter would wrongly drop.
  const orders = ((data ?? []) as StorefrontOrder[]).filter(
    (o) => o.status !== "cancelled",
  );

  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: DIGEST_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  // Keep the task list in lockstep at the same times the email goes out: one
  // "Enter <SO> into Fishbowl" task per order needing entry, removed once an
  // order is entered/cancelled. (Marking an order in Fishbowl also clears its
  // task instantly — see app/api/storefront-orders/[id]/route.ts.)
  const taskSync = await syncFishbowlTasks(orders, dry);

  if (dry) {
    return NextResponse.json({
      dry: true,
      hour,
      tz: DIGEST_TZ,
      to: DIGEST_TO,
      count: orders.length,
      taskSync,
      orders: orders.map((o) => ({ ref: orderRef(o), id: o.id, total: o.total })),
    });
  }

  // Nothing to enter → don't send, so an empty inbox isn't pinged twice a day.
  // (Task sync already ran above, so resolved tasks still get cleaned up.)
  if (orders.length === 0) {
    return NextResponse.json({ sent: false, reason: "nothing needs Fishbowl entry", taskSync });
  }

  // Sender: first connected Outlook account (same fallback as the automations
  // cron). The digest mails from that mailbox to DIGEST_TO.
  const { data: acct } = await supabaseServer
    .from("user_email_accounts")
    .select("user_id")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  const senderUserId = (acct?.user_id as string | null) ?? null;
  if (!senderUserId) {
    return NextResponse.json(
      { error: "No connected Outlook account to send from (Settings → Email)." },
      { status: 500 },
    );
  }

  const origin =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    "https://www.fragrance-marketing-group.com";

  try {
    const { accessToken } = await getAccessTokenForUser(senderUserId);
    const subject = `FMG · ${orders.length} sales order${orders.length === 1 ? "" : "s"} need Fishbowl entry`;
    await sendEmail(accessToken, {
      subject,
      bodyHtml: buildHtml(orders, origin, label),
      to: DIGEST_TO,
    });
    return NextResponse.json({ sent: true, count: orders.length, to: DIGEST_TO, taskSync });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Reconcile the FMG task list against the orders that still need Fishbowl
 * entry: create one "Enter <SO> into Fishbowl" task per order that lacks an
 * open one, and delete auto-tasks whose order is no longer in the list
 * (entered or cancelled). Scoped to tasks carrying `fishbowl_order_id`, so
 * human-created tasks are never touched. Fails soft if the FMG migration
 * isn't in yet, so the email still sends.
 */
async function syncFishbowlTasks(
  orders: StorefrontOrder[],
  dry: boolean,
): Promise<{ created: number; removed: number }> {
  const needById = new Map(orders.map((o) => [o.id, o]));

  const { data, error } = await supabaseServer
    .from("tasks")
    .select("id, fishbowl_order_id")
    .not("fishbowl_order_id", "is", null)
    .neq("status", "done");
  if (error) return { created: 0, removed: 0 };

  const openTasks = (data ?? []) as { id: string; fishbowl_order_id: string }[];
  const haveTaskFor = new Set(openTasks.map((t) => t.fishbowl_order_id));

  const toCreate = orders.filter((o) => !haveTaskFor.has(o.id));
  const toRemove = openTasks.filter((t) => !needById.has(t.fishbowl_order_id));

  if (dry) return { created: toCreate.length, removed: toRemove.length };

  let created = 0;
  let removed = 0;
  if (toCreate.length > 0) {
    const rows = toCreate.map((o) => ({
      name: `Enter ${orderRef(o)} into Fishbowl`,
      description: "Storefront sales order awaiting entry into Fishbowl.",
      owner: TASK_OWNER,
      priority: "High",
      status: "todo" as const,
      completed: false,
      fishbowl_order_id: o.id,
    }));
    const { error: insErr } = await supabaseServer.from("tasks").insert(rows);
    if (!insErr) created = rows.length;
  }
  if (toRemove.length > 0) {
    const { error: delErr } = await supabaseServer
      .from("tasks")
      .delete()
      .in(
        "id",
        toRemove.map((t) => t.id),
      );
    if (!delErr) removed = toRemove.length;
  }
  return { created, removed };
}
