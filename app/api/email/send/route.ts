import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import {
  applyMergeFields,
  currentQuarterLabel,
  daysSince,
  firstNameOf,
  sendEmail,
  type MergeVars,
} from "@/lib/email/send";
import { publicOriginFromRequest } from "@/lib/email/origin";
import { buildTrackedHtmlBody } from "@/lib/email/tracking";

export const runtime = "nodejs";
// Vercel Pro caps serverless functions at ~300s. With concurrency 5 below,
// 500 recipients fit comfortably inside that.
export const maxDuration = 300;

// Send up to N recipients in parallel. Graph allows ~30 sends/s per user;
// 5 concurrent stays well under throttling thresholds and keeps a 500-message
// blast under ~3 minutes including per-message DB writes.
const SEND_CONCURRENCY = 5;

type SendRequestBody = {
  recipients: Array<{
    customer_type: "wholesale" | "d2c";
    customer_ref: string;
  }>;
  subject_template: string;
  body_template: string;
  /** Plain text or HTML — we send as HTML, escaping is the caller's job. */
  body_format?: "text" | "html";
};

type ContactRow = {
  customer_ref: string;
  email: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  channel: string | null;
  lifetime_revenue: number | null;
  lifetime_orders: number | null;
  last_order_date: string | null;
};

/**
 * Fetch the columns we need for merge-field substitution + recipient lookup,
 * for both wholesale and d2c. Each customer type lives in its own contact view.
 */
async function loadContacts(
  wholesale: string[],
  d2c: string[],
): Promise<Map<string, ContactRow & { customer_type: "wholesale" | "d2c" }>> {
  const result = new Map<string, ContactRow & { customer_type: "wholesale" | "d2c" }>();

  if (wholesale.length > 0) {
    const { data } = await supabaseServer
      .from("customer_contact_summary")
      .select(
        "customerid, email, customer_name, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date",
      )
      .in("customerid", wholesale);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const ref = r.customerid as string;
      result.set(`wholesale:${ref}`, {
        customer_type: "wholesale",
        customer_ref: ref,
        email: (r.email as string | null) ?? null,
        name: (r.customer_name as string | null) ?? null,
        city: (r.billto_city as string | null) ?? null,
        state: (r.billto_state as string | null) ?? null,
        channel: (r.primary_channel as string | null) ?? null,
        lifetime_revenue: numOrNull(r.lifetime_revenue),
        lifetime_orders: numOrNull(r.order_count),
        last_order_date: (r.last_order_date as string | null) ?? null,
      });
    }
  }

  if (d2c.length > 0) {
    const { data } = await supabaseServer
      .from("d2c_customer_contact")
      .select(
        "person_key, email, customer_name, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date",
      )
      .in("person_key", d2c);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const ref = r.person_key as string;
      result.set(`d2c:${ref}`, {
        customer_type: "d2c",
        customer_ref: ref,
        email: (r.email as string | null) ?? null,
        name: (r.customer_name as string | null) ?? null,
        city: (r.billto_city as string | null) ?? null,
        state: (r.billto_state as string | null) ?? null,
        channel: (r.primary_channel as string | null) ?? null,
        lifetime_revenue: numOrNull(r.lifetime_revenue),
        lifetime_orders: numOrNull(r.order_count),
        last_order_date: (r.last_order_date as string | null) ?? null,
      });
    }
  }

  return result;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return isFinite(n) ? n : null;
}

/**
 * POST /api/email/send
 * Body: { recipients, subject_template, body_template, body_format? }
 * Sends one email per recipient (per-customer separate, not group). Returns
 * a job summary the UI can show.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: SendRequestBody;
  try {
    body = (await request.json()) as SendRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject_template?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (!body.body_template?.trim()) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ error: "Pick at least one recipient" }, { status: 400 });
  }
  if (body.recipients.length > 500) {
    return NextResponse.json(
      {
        error: `Too many recipients in a single send (got ${body.recipients.length}, max 500). Refine the filter or split the send.`,
      },
      { status: 400 },
    );
  }

  // Mint an access token for the sender.
  let accessToken: string;
  let accountId: string;
  let senderEmail: string;
  let senderDisplayName: string | null;
  try {
    const t = await getAccessTokenForUser(user.id);
    accessToken = t.accessToken;
    accountId = t.account.id;
    senderEmail = t.account.email;
    senderDisplayName = t.account.display_name;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  // Sender + date vars are constant across the recipient loop — compute once.
  const senderVars = {
    senderName: senderDisplayName,
    senderFirstName: firstNameOf(senderDisplayName),
    senderEmail,
    currentYear: String(new Date().getFullYear()),
    currentQuarter: currentQuarterLabel(),
  };

  // Pull contacts.
  const wholesaleRefs = body.recipients
    .filter((r) => r.customer_type === "wholesale")
    .map((r) => r.customer_ref);
  const d2cRefs = body.recipients
    .filter((r) => r.customer_type === "d2c")
    .map((r) => r.customer_ref);
  const contacts = await loadContacts(wholesaleRefs, d2cRefs);

  // Open the job row.
  const { data: jobRow, error: jobErr } = await supabaseServer
    .from("email_send_jobs")
    .insert({
      account_id: accountId,
      subject_template: body.subject_template,
      body_template: body.body_template,
      target_count: body.recipients.length,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobErr || !jobRow) {
    return NextResponse.json(
      { error: `Could not create send job: ${jobErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  const jobId = jobRow.id as string;

  let sentCount = 0;
  let failedCount = 0;
  const origin = publicOriginFromRequest(request);

  // Per-recipient processor — extracted so we can run a small pool in parallel.
  const sendOne = async (r: SendRequestBody["recipients"][number]): Promise<void> => {
    const key = `${r.customer_type}:${r.customer_ref}`;
    const contact = contacts.get(key);

    const recipientRow = {
      job_id: jobId,
      customer_type: r.customer_type,
      customer_ref: r.customer_ref,
      customer_email: contact?.email ?? "",
      customer_name: contact?.name ?? null,
      personalized_subject: "",
      personalized_body: "",
      status: "pending" as "pending" | "sent" | "failed" | "skipped",
      error_text: null as string | null,
      sent_at: null as string | null,
      message_id: null as string | null,
    };

    if (!contact || !contact.email) {
      recipientRow.status = "skipped";
      recipientRow.error_text = "No email address on file";
      // personalized_* columns are NOT NULL — fall back to the template text.
      recipientRow.personalized_subject = body.subject_template;
      recipientRow.personalized_body = body.body_template;
      failedCount++;
      await supabaseServer.from("email_send_job_recipients").insert(recipientRow);
      return;
    }

    const vars: MergeVars = {
      firstName: firstNameOf(contact.name),
      customerName: contact.name,
      city: contact.city,
      state: contact.state,
      channel: contact.channel,
      lifetimeRevenue: contact.lifetime_revenue,
      lifetimeOrders: contact.lifetime_orders,
      lastOrderDate: contact.last_order_date,
      daysSinceLastOrder: daysSince(contact.last_order_date),
      ...senderVars,
    };
    const subject = applyMergeFields(body.subject_template, vars);
    const bodyContent = applyMergeFields(body.body_template, vars);
    recipientRow.personalized_subject = subject;
    recipientRow.personalized_body = bodyContent;

    // Pre-generate the message id so the tracking pixel URL we embed in the
    // outbound HTML matches the row we'll insert below.
    const messageId = randomUUID();
    const tracked = buildTrackedHtmlBody({
      plainText: bodyContent,
      origin,
      messageId,
    });

    try {
      const sent = await sendEmail(accessToken, {
        subject,
        bodyHtml: tracked.html,
        to: [{ address: contact.email, name: contact.name ?? undefined }],
      });

      // Upsert thread keyed by (account, conversationId).
      const { data: thread, error: threadErr } = await supabaseServer
        .from("email_threads")
        .upsert(
          {
            account_id: accountId,
            customer_type: r.customer_type,
            customer_ref: r.customer_ref,
            customer_name: contact.name,
            conversation_id: sent.conversationId,
            subject,
            last_message_at: sent.sentAt,
            last_direction: "sent",
            last_preview: sent.bodyPreview ?? bodyContent.slice(0, 200),
          },
          { onConflict: "account_id,conversation_id" },
        )
        .select("id")
        .single();
      if (threadErr || !thread) {
        throw new Error(`Thread upsert failed: ${threadErr?.message ?? "unknown"}`);
      }

      // Insert the message row with the pre-generated id so trackings line up.
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
          to_addresses: [{ address: contact.email, name: contact.name }],
          subject,
          // Store the original plain text so the UI can render bubbles cleanly,
          // plus the actual HTML we shipped so we can debug tracking issues.
          body_text: bodyContent,
          body_html: tracked.html,
          body_preview: sent.bodyPreview ?? bodyContent.slice(0, 200),
          sent_at: sent.sentAt,
        })
        .select("id")
        .single();
      if (msgErr || !msg) {
        throw new Error(`Message insert failed: ${msgErr?.message ?? "unknown"}`);
      }

      // Persist link tracking rows so click redirects work.
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

      recipientRow.status = "sent";
      recipientRow.sent_at = sent.sentAt;
      recipientRow.message_id = msg.id;
      sentCount++;
    } catch (e) {
      recipientRow.status = "failed";
      recipientRow.error_text = e instanceof Error ? e.message : String(e);
      failedCount++;
    }

    await supabaseServer.from("email_send_job_recipients").insert(recipientRow);
  };

  // Run sendOne against the recipient list with a small concurrency pool.
  await runWithConcurrency(body.recipients, SEND_CONCURRENCY, sendOne);

  await supabaseServer
    .from("email_send_jobs")
    .update({
      sent_count: sentCount,
      failed_count: failedCount,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return NextResponse.json({
    job_id: jobId,
    sent: sentCount,
    failed: failedCount,
    total: body.recipients.length,
  });
}

/**
 * Run an async worker against an array with bounded concurrency. Each worker
 * pulls the next index from a shared cursor, so slow tasks don't block the
 * pool. Worker failures are swallowed (the worker itself is expected to
 * record per-item errors).
 */
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
        /* worker is responsible for its own error handling */
      }
    }
  };
  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(pool);
}
