import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";
import { getAccessTokenForUser } from "@/lib/email/tokens";
import {
  applyMergeFields,
  firstNameOf,
  sendEmail,
} from "@/lib/email/send";

export const runtime = "nodejs";
// Graph sendMail is per-recipient. A 25-recipient batch with the create-draft
// + send pattern is ~50 round-trips, so leave plenty of headroom.
export const maxDuration = 120;

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
  state: string | null;
};

/**
 * Fetch contact details (email + name + state for merge fields) for both
 * wholesale and d2c recipients. Hits the appropriate view for each type.
 */
async function loadContacts(
  wholesale: string[],
  d2c: string[],
): Promise<Map<string, ContactRow & { customer_type: "wholesale" | "d2c" }>> {
  const result = new Map<string, ContactRow & { customer_type: "wholesale" | "d2c" }>();

  if (wholesale.length > 0) {
    const { data } = await supabaseServer
      .from("customer_contact_summary")
      .select("customerid, email, customer_name, billto_state")
      .in("customerid", wholesale);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const ref = r.customerid as string;
      result.set(`wholesale:${ref}`, {
        customer_type: "wholesale",
        customer_ref: ref,
        email: (r.email as string | null) ?? null,
        name: (r.customer_name as string | null) ?? null,
        state: (r.billto_state as string | null) ?? null,
      });
    }
  }

  if (d2c.length > 0) {
    const { data } = await supabaseServer
      .from("d2c_customer_contact")
      .select("person_key, email, customer_name, billto_state")
      .in("person_key", d2c);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const ref = r.person_key as string;
      result.set(`d2c:${ref}`, {
        customer_type: "d2c",
        customer_ref: ref,
        email: (r.email as string | null) ?? null,
        name: (r.customer_name as string | null) ?? null,
        state: (r.billto_state as string | null) ?? null,
      });
    }
  }

  return result;
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
  if (body.recipients.length > 250) {
    return NextResponse.json(
      { error: "Too many recipients in a single send (max 250)" },
      { status: 400 },
    );
  }

  // Mint an access token for the sender.
  let accessToken: string;
  let accountId: string;
  let senderEmail: string;
  try {
    const t = await getAccessTokenForUser(user.id);
    accessToken = t.accessToken;
    accountId = t.account.id;
    senderEmail = t.account.email;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

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
  const isHtml = (body.body_format ?? "text") === "html";

  // Send one at a time. Could parallelize with a small pool later, but for
  // ≤250 recipients the simple loop keeps order predictable and per-error
  // handling cleaner.
  for (const r of body.recipients) {
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
      continue;
    }

    const vars = {
      firstName: firstNameOf(contact.name),
      customerName: contact.name,
      state: contact.state,
    };
    const subject = applyMergeFields(body.subject_template, vars);
    const bodyContent = applyMergeFields(body.body_template, vars);
    recipientRow.personalized_subject = subject;
    recipientRow.personalized_body = bodyContent;

    try {
      const sent = await sendEmail(accessToken, {
        subject,
        ...(isHtml ? { bodyHtml: bodyContent } : { bodyText: bodyContent }),
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
            last_preview: sent.bodyPreview,
          },
          { onConflict: "account_id,conversation_id" },
        )
        .select("id")
        .single();
      if (threadErr || !thread) {
        throw new Error(`Thread upsert failed: ${threadErr?.message ?? "unknown"}`);
      }

      // Insert the message row.
      const { data: msg, error: msgErr } = await supabaseServer
        .from("email_messages")
        .insert({
          thread_id: thread.id,
          account_id: accountId,
          direction: "sent",
          graph_message_id: sent.graphMessageId,
          internet_message_id: sent.internetMessageId,
          conversation_id: sent.conversationId,
          from_address: sent.fromAddress ?? senderEmail,
          to_addresses: [{ address: contact.email, name: contact.name }],
          subject,
          body_html: isHtml ? bodyContent : null,
          body_text: isHtml ? null : bodyContent,
          body_preview: sent.bodyPreview ?? bodyContent.slice(0, 200),
          sent_at: sent.sentAt,
        })
        .select("id")
        .single();
      if (msgErr || !msg) {
        throw new Error(`Message insert failed: ${msgErr?.message ?? "unknown"}`);
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
  }

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
