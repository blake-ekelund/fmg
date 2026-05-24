import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import {
  applyMergeFields,
  currentQuarterLabel,
  daysSince,
  firstNameOf,
  sendEmail,
  type MergeVars,
} from "@/lib/email/send";
import { buildTrackedHtmlBody } from "@/lib/email/tracking";

export const runtime = "nodejs";
export const maxDuration = 300;

// Hard ceiling per run; if more candidates exist we'll catch them tomorrow.
const MAX_PER_RUN = 100;
// Same concurrency policy as the manual bulk send.
const SEND_CONCURRENCY = 5;

type Config = {
  trigger_days: number;
  lookback_days: number;
  discount_code: string;
  subject: string;
  body: string;
};

const DEFAULT_CONFIG: Config = {
  trigger_days: 180,
  lookback_days: 30,
  discount_code: "WELCOMEBACK15",
  subject: "We miss you, {{firstName}} — 15% off your next order",
  body:
    "Hi {{firstName}},\n\nIt's been a few months since your last order, and I just wanted to check in.\n\n" +
    "If you've been thinking about restocking, here's 15% off — no minimum, valid for the next 30 days:\n\n" +
    "Code: WELCOMEBACK15\n\nShop now: https://naturalinspirations.com\n\n" +
    "Hope to see you soon,\n{{senderFirstName}}",
};

/**
 * GET /api/cron/d2c-reengagement
 *
 * Daily cron. Finds D2C customers who just crossed the 180-day inactivity
 * mark (within the lookback window) and emails them a 15%-off reorder
 * nudge from the configured sender's mailbox. Tracks every send so we
 * never re-engage the same customer twice from this automation.
 *
 * Supports `?dry=1` for a no-op preview (still requires CRON_SECRET when
 * one is configured) and `?test=<email>` to override the recipient pool
 * with a single test address.
 */
export async function GET(request: Request) {
  // Vercel cron: Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const testEmail = url.searchParams.get("test")?.trim() || null;

  /* ── 1) Load settings ── */
  const { data: settings, error: settingsErr } = await supabaseServer
    .from("automation_settings")
    .select("enabled, sender_user_id, config")
    .eq("name", "d2c_reengagement")
    .maybeSingle();
  if (settingsErr) {
    return NextResponse.json({ error: settingsErr.message }, { status: 500 });
  }
  if (!settings) {
    return NextResponse.json({ skipped: "no settings row" });
  }
  if (!settings.enabled && !testEmail) {
    return NextResponse.json({ skipped: "disabled" });
  }

  const cfg: Config = { ...DEFAULT_CONFIG, ...((settings.config as Partial<Config>) ?? {}) };

  /* ── 2) Resolve sender ── */
  let senderUserId = settings.sender_user_id as string | null;
  if (!senderUserId) {
    // Fallback: pick the first owner with a connected mailbox.
    const { data: fallback } = await supabaseServer
      .from("user_email_accounts")
      .select("user_id, status")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();
    senderUserId = (fallback?.user_id as string | null) ?? null;
  }
  if (!senderUserId) {
    return NextResponse.json(
      { error: "No sender configured and no connected mailbox to fall back to" },
      { status: 412 },
    );
  }

  let accessToken: string;
  let accountId: string;
  let senderEmail: string;
  let senderDisplay: string | null;
  try {
    const t = await getAccessTokenForUser(senderUserId);
    accessToken = t.accessToken;
    accountId = t.account.id;
    senderEmail = t.account.email;
    senderDisplay = t.account.display_name;
  } catch (e) {
    return NextResponse.json(
      { error: `Sender token failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  /* ── 3) Find candidates ── */
  const now = new Date();
  const triggerDate = new Date(now);
  triggerDate.setDate(triggerDate.getDate() - cfg.trigger_days);
  const oldestDate = new Date(triggerDate);
  oldestDate.setDate(oldestDate.getDate() - cfg.lookback_days);

  type Candidate = {
    person_key: string;
    customer_name: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    channel: string | null;
    lifetime_revenue: number | null;
    lifetime_orders: number | null;
    last_order_date: string | null;
  };
  let candidates: Candidate[];

  if (testEmail) {
    // Test mode: send one email to the override address, ignoring eligibility.
    candidates = [
      {
        person_key: "__test__",
        customer_name: "Test Customer",
        email: testEmail,
        city: null,
        state: null,
        channel: "TEST",
        lifetime_revenue: null,
        lifetime_orders: null,
        last_order_date: null,
      },
    ];
  } else {
    const { data, error } = await supabaseServer
      .from("d2c_customer_contact")
      .select(
        "person_key, customer_name, email, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date",
      )
      .gte("last_order_date", oldestDate.toISOString().slice(0, 10))
      .lt("last_order_date", triggerDate.toISOString().slice(0, 10))
      .not("email", "is", null)
      .limit(MAX_PER_RUN * 2); // pull extra so already-sent filtering still leaves enough

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    candidates = ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      person_key: r.person_key as string,
      customer_name: (r.customer_name as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      city: (r.billto_city as string | null) ?? null,
      state: (r.billto_state as string | null) ?? null,
      channel: (r.primary_channel as string | null) ?? null,
      lifetime_revenue: numOrNull(r.lifetime_revenue),
      lifetime_orders: numOrNull(r.order_count),
      last_order_date: (r.last_order_date as string | null) ?? null,
    }));
  }

  /* ── 4) Filter out already-sent ── */
  if (!testEmail && candidates.length > 0) {
    const { data: already } = await supabaseServer
      .from("d2c_reengagement_sends")
      .select("person_key")
      .in("person_key", candidates.map((c) => c.person_key));
    const sentSet = new Set(
      (already ?? []).map((r) => (r as { person_key: string }).person_key),
    );
    candidates = candidates.filter((c) => !sentSet.has(c.person_key));
  }

  candidates = candidates.slice(0, MAX_PER_RUN);

  if (dryRun) {
    return NextResponse.json({
      dry: true,
      window: {
        from: oldestDate.toISOString().slice(0, 10),
        to: triggerDate.toISOString().slice(0, 10),
      },
      eligible: candidates.length,
      sample: candidates.slice(0, 10).map((c) => ({
        person_key: c.person_key,
        name: c.customer_name,
        email: c.email,
        last_order_date: c.last_order_date,
      })),
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      window: {
        from: oldestDate.toISOString().slice(0, 10),
        to: triggerDate.toISOString().slice(0, 10),
      },
      eligible: 0,
      sent: 0,
      failed: 0,
    });
  }

  /* ── 5) Send ── */
  const origin =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    "https://www.fragrance-marketing-group.com";

  const senderVars = {
    senderName: senderDisplay,
    senderFirstName: firstNameOf(senderDisplay),
    senderEmail,
    currentYear: String(new Date().getFullYear()),
    currentQuarter: currentQuarterLabel(),
  };

  let sentCount = 0;
  let failedCount = 0;

  const sendOne = async (c: Candidate): Promise<void> => {
    if (!c.email) return;

    const vars: MergeVars = {
      firstName: firstNameOf(c.customer_name),
      customerName: c.customer_name,
      city: c.city,
      state: c.state,
      channel: c.channel,
      lifetimeRevenue: c.lifetime_revenue,
      lifetimeOrders: c.lifetime_orders,
      lastOrderDate: c.last_order_date,
      daysSinceLastOrder: daysSince(c.last_order_date),
      ...senderVars,
    };

    const subject = applyMergeFields(cfg.subject, vars);
    const bodyText = applyMergeFields(cfg.body, vars);
    const messageId = randomUUID();
    const tracked = buildTrackedHtmlBody({
      plainText: bodyText,
      origin,
      messageId,
    });

    try {
      const sent = await sendEmail(accessToken, {
        subject,
        bodyHtml: tracked.html,
        to: [{ address: c.email, name: c.customer_name ?? undefined }],
      });

      // Thread + message rows so the send shows up in the customer's
      // Emails tab and in the inbox, same as a manual send.
      const { data: thread } = await supabaseServer
        .from("email_threads")
        .upsert(
          {
            account_id: accountId,
            customer_type: "d2c",
            customer_ref: c.person_key,
            customer_name: c.customer_name,
            conversation_id: sent.conversationId,
            subject,
            last_message_at: sent.sentAt,
            last_direction: "sent",
            last_preview: sent.bodyPreview ?? bodyText.slice(0, 200),
          },
          { onConflict: "account_id,conversation_id" },
        )
        .select("id")
        .single();
      if (!thread) throw new Error("Thread upsert returned no id");

      const { data: msg, error: msgErr } = await supabaseServer
        .from("email_messages")
        .insert({
          id: messageId,
          thread_id: thread.id,
          account_id: accountId,
          direction: "sent",
          graph_message_id: sent.graphMessageId,
          internet_message_id: sent.internetMessageId,
          conversation_id: sent.conversationId,
          from_address: sent.fromAddress ?? senderEmail,
          to_addresses: [{ address: c.email, name: c.customer_name }],
          subject,
          body_text: bodyText,
          body_html: tracked.html,
          body_preview: sent.bodyPreview ?? bodyText.slice(0, 200),
          sent_at: sent.sentAt,
        })
        .select("id")
        .single();
      if (msgErr || !msg) throw new Error(msgErr?.message ?? "Message insert failed");

      if (tracked.links.length > 0) {
        await supabaseServer.from("email_message_links").insert(
          tracked.links.map((l) => ({
            id: l.id,
            message_id: messageId,
            link_index: l.link_index,
            original_url: l.original_url,
          })),
        );
      }

      // Skip the send-tracking insert in test mode (no real person_key).
      if (c.person_key !== "__test__") {
        await supabaseServer.from("d2c_reengagement_sends").insert({
          person_key: c.person_key,
          customer_name: c.customer_name,
          customer_email: c.email,
          message_id: msg.id,
          discount_code: cfg.discount_code,
          status: "sent",
        });
      }

      sentCount++;
    } catch (e) {
      failedCount++;
      if (c.person_key !== "__test__") {
        await supabaseServer
          .from("d2c_reengagement_sends")
          .insert({
            person_key: c.person_key,
            customer_name: c.customer_name,
            customer_email: c.email,
            discount_code: cfg.discount_code,
            status: "failed",
            error_text: e instanceof Error ? e.message : String(e),
          })
          .then(() => null);
      }
    }
  };

  await runWithConcurrency(candidates, SEND_CONCURRENCY, sendOne);

  return NextResponse.json({
    window: {
      from: oldestDate.toISOString().slice(0, 10),
      to: triggerDate.toISOString().slice(0, 10),
    },
    eligible: candidates.length,
    sent: sentCount,
    failed: failedCount,
  });
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return isFinite(n) ? n : null;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const next = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
      } catch {
        /* per-item handler is responsible for logging */
      }
    }
  };
  const pool = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next(),
  );
  await Promise.all(pool);
}
