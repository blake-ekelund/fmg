/**
 * Background worker for queued bulk sends (transport = 'resend').
 *
 * The enqueue endpoint (/api/email/bulk-send) snapshots a job plus one row per
 * recipient; this worker — invoked by /api/cron/bulk-send — claims pending
 * recipients in chunks and sends them through Resend from the brand's verified
 * domain. Splitting enqueue from delivery is what removes the old synchronous
 * path's failure modes: no 300s timeout truncating a blast, no double-send on
 * retry (interrupted claims are failed, never re-sent), and progress the UI
 * can poll.
 *
 * Rate: Resend's default API limit is 2 requests/second, so the pool is small
 * and 429s back off and retry. A 2,500-recipient job clears in a handful of
 * cron ticks.
 */

import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  applyMergeFields,
  currentQuarterLabel,
  daysSince,
  firstNameOf,
  type MergeVars,
} from "@/lib/email/send";
import { dispatchEmail } from "@/lib/email/dispatch";
import { resolveSender } from "@/lib/email/sender";
import { buildTrackedHtmlFromHtml } from "@/lib/email/tracking";
import { splitContactName } from "@/lib/email/mergeFields";
import { primaryEmail } from "@/lib/email/addresses";
import {
  findSuppressed,
  listUnsubscribeHeaders,
  normalizeEmail,
  unsubscribeFooterHtml,
  unsubscribeUrl,
} from "@/lib/email/unsubscribe";
import type { Brand } from "@/components/templates/types";

/** Recipients claimed per chunk. One chunk is one claim query + N sends. */
const CHUNK_SIZE = 50;
/** Concurrent Resend calls. Resend's default cap is 2 req/s — stay at 2. */
const SEND_CONCURRENCY = 2;
/** A pending row claimed longer ago than this was interrupted mid-send. */
const RECLAIM_AFTER_MS = 15 * 60 * 1000;

type Job = {
  id: string;
  account_id: string;
  subject_template: string;
  body_template: string;
  status: string;
  cc_json: Array<{ address: string }> | null;
  brand: string | null;
  from_name: string | null;
  reply_to: string | null;
  /** Test run: deliver every copy here instead of the customer. */
  test_email: string | null;
};

type RecipientRow = {
  id: string;
  customer_type: "wholesale" | "d2c";
  customer_ref: string;
  customer_email: string;
  customer_name: string | null;
};

type ContactRow = {
  email: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  channel: string | null;
  lifetime_revenue: number | null;
  lifetime_orders: number | null;
  last_order_date: string | null;
};

export type BulkWorkerResult = {
  jobs_touched: number;
  sent: number;
  failed: number;
  skipped: number;
  reclaimed: number;
  /** Pending recipients still queued when the deadline hit. */
  remaining: number;
};

/** Same env-derived origin the automations cron uses for tracking + unsubscribe links. */
export function bulkSendOrigin(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") ||
    "https://app.fragrancemarketinggroup.com"
  );
}

/**
 * Process queued bulk-send jobs until none remain or `deadlineMs` passes.
 * Safe to run concurrently with itself: claims are atomic updates, so two
 * overlapping runs never send the same recipient twice.
 */
export async function processBulkSendJobs(deadlineMs: number): Promise<BulkWorkerResult> {
  const result: BulkWorkerResult = {
    jobs_touched: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    reclaimed: 0,
    remaining: 0,
  };

  result.reclaimed = await failInterruptedClaims();

  // Oldest job first — jobs complete in the order they were queued.
  const { data: jobRows } = await supabaseServer
    .from("email_send_jobs")
    .select("id, account_id, subject_template, body_template, status, cc_json, brand, from_name, reply_to, test_email")
    .eq("transport", "resend")
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: true })
    .limit(10);

  for (const job of (jobRows as Job[] | null) ?? []) {
    if (Date.now() >= deadlineMs) break;
    result.jobs_touched++;
    await processOneJob(job, deadlineMs, result);
  }

  // How much is left across all active jobs (for the caller's response/logs).
  const { count } = await supabaseServer
    .from("email_send_job_recipients")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .in(
      "job_id",
      ((jobRows as Job[] | null) ?? []).map((j) => j.id),
    );
  result.remaining = count ?? 0;

  return result;
}

async function processOneJob(job: Job, deadlineMs: number, result: BulkWorkerResult): Promise<void> {
  if (job.status === "pending") {
    await supabaseServer
      .from("email_send_jobs")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending");
  }

  const sender = resolveSender({
    brand: (job.brand as Brand | null) ?? null,
    fromName: job.from_name,
    replyTo: job.reply_to,
  });
  const origin = bulkSendOrigin();
  const ccRecipients = (job.cc_json ?? []).filter((c) => c?.address);

  // Sender/date merge vars are constant per job. For Resend the "sender" a
  // recipient sees is the brand, so {{senderName}} et al. reflect it.
  const senderVars = {
    senderName: sender.fromName,
    senderFirstName: firstNameOf(sender.fromName),
    senderEmail: sender.fromEmail,
    currentYear: String(new Date().getFullYear()),
    currentQuarter: currentQuarterLabel(),
  };
  const bodyHasOwnUnsubscribe = /\{\{\s*unsubscribeUrl\s*\}\}/.test(job.body_template);

  while (Date.now() < deadlineMs) {
    // Stop mid-job the moment the user cancels.
    const { data: fresh } = await supabaseServer
      .from("email_send_jobs")
      .select("status")
      .eq("id", job.id)
      .maybeSingle();
    if (fresh?.status === "cancelled") {
      await skipRemaining(job.id, "Cancelled before send");
      await finalizeJob(job.id, "cancelled");
      return;
    }

    const claimed = await claimChunk(job.id, CHUNK_SIZE);
    if (claimed.length === 0) break;

    const contacts = await loadContactsFor(claimed);
    // Re-check suppression per chunk — an unsubscribe that lands mid-job must
    // stop that person's email even though enqueue already filtered once. On a
    // test run the person actually receiving mail is the tester, so check them.
    const suppressed = await findSuppressed(
      job.test_email ? [job.test_email] : claimed.map((r) => r.customer_email),
    );

    await runWithConcurrency(claimed, SEND_CONCURRENCY, async (r) => {
      try {
        await sendOne(job, r, {
          sender,
          origin,
          ccRecipients,
          senderVars,
          bodyHasOwnUnsubscribe,
          contact: contacts.get(`${r.customer_type}:${r.customer_ref}`) ?? null,
          suppressed,
          result,
        });
      } catch (e) {
        // sendOne records its own outcomes; this catches only bookkeeping bugs.
        await supabaseServer
          .from("email_send_job_recipients")
          .update({ status: "failed", error_text: e instanceof Error ? e.message : String(e) })
          .eq("id", r.id);
        result.failed++;
      }
    });
  }

  // If nothing is pending, the job is done — total up and close it.
  const { count: pendingLeft } = await supabaseServer
    .from("email_send_job_recipients")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id)
    .eq("status", "pending");
  if ((pendingLeft ?? 0) === 0) {
    await finalizeJob(job.id, "completed");
  }
}

/**
 * Atomically claim up to `limit` pending, unclaimed recipients of a job.
 * The `.is("claimed_at", null)` guard in the UPDATE is what makes overlapping
 * workers safe: a row already claimed by the other run simply doesn't match.
 */
async function claimChunk(jobId: string, limit: number): Promise<RecipientRow[]> {
  const { data: candidates } = await supabaseServer
    .from("email_send_job_recipients")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "pending")
    .is("claimed_at", null)
    .limit(limit);
  const ids = ((candidates as Array<{ id: string }> | null) ?? []).map((c) => c.id);
  if (ids.length === 0) return [];

  const { data: claimed } = await supabaseServer
    .from("email_send_job_recipients")
    .update({ claimed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending")
    .is("claimed_at", null)
    .select("id, customer_type, customer_ref, customer_email, customer_name");
  return (claimed as RecipientRow[] | null) ?? [];
}

async function sendOne(
  job: Job,
  r: RecipientRow,
  ctx: {
    sender: ReturnType<typeof resolveSender>;
    origin: string;
    ccRecipients: Array<{ address: string }>;
    senderVars: Record<string, string | null>;
    bodyHasOwnUnsubscribe: boolean;
    contact: ContactRow | null;
    suppressed: Set<string>;
    result: BulkWorkerResult;
  },
): Promise<void> {
  const { sender, origin, ccRecipients, senderVars, bodyHasOwnUnsubscribe, contact, suppressed, result } = ctx;

  const testEmail = job.test_email;
  const deliverTo = testEmail ?? r.customer_email;

  if (suppressed.has(normalizeEmail(deliverTo))) {
    await supabaseServer
      .from("email_send_job_recipients")
      .update({
        status: "skipped",
        error_text: testEmail ? "Test address is unsubscribed" : "Unsubscribed",
      })
      .eq("id", r.id);
    result.skipped++;
    return;
  }

  // On a test run the token must belong to the tester, not the customer whose
  // data was borrowed — clicking "unsubscribe" while proofing must never opt
  // out a real customer.
  const unsubPayload = testEmail
    ? { email: testEmail }
    : {
        email: r.customer_email,
        customerType: r.customer_type,
        customerRef: r.customer_ref,
      };
  const unsubLink = unsubscribeUrl(origin, unsubPayload);

  const name = contact?.name ?? r.customer_name;
  const { firstName, lastName } = splitContactName(name, r.customer_type);
  const vars: MergeVars = {
    firstName,
    lastName,
    customerName: name,
    city: contact?.city ?? null,
    state: contact?.state ?? null,
    channel: contact?.channel ?? null,
    lifetimeRevenue: contact?.lifetime_revenue ?? null,
    lifetimeOrders: contact?.lifetime_orders ?? null,
    lastOrderDate: contact?.last_order_date ?? null,
    daysSinceLastOrder: daysSince(contact?.last_order_date ?? null),
    unsubscribeUrl: unsubLink,
    ...senderVars,
  };

  const subjectBase = applyMergeFields(job.subject_template, vars);
  const subject = testEmail
    ? `[TEST → ${name ?? r.customer_ref}] ${subjectBase}`
    : subjectBase;
  const bodyContent = applyMergeFields(job.body_template, vars);

  // Test copies keep their links untouched (no click-redirect rewriting or
  // open pixel): a test must never write tracking rows or customer history,
  // and rewritten links without their DB rows would 404 on the tester.
  const messageId = randomUUID();
  const tracked = testEmail
    ? {
        html:
          bodyContent +
          (bodyHasOwnUnsubscribe ? "" : unsubscribeFooterHtml(unsubLink)),
        links: [] as Array<{ id: string; link_index: number; original_url: string }>,
      }
    : buildTrackedHtmlFromHtml({
        html: bodyContent,
        origin,
        messageId,
        footerHtml: bodyHasOwnUnsubscribe ? undefined : unsubscribeFooterHtml(unsubLink),
      });

  try {
    const sent = await withResendRetry(() =>
      dispatchEmail({
        input: {
          subject,
          bodyHtml: tracked.html,
          to: [{ address: deliverTo, name: testEmail ? undefined : name ?? undefined }],
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          headers: listUnsubscribeHeaders(origin, unsubPayload),
        },
        sender,
        // Resend-only path: enqueue refuses jobs when Resend isn't configured,
        // so there is deliberately no Outlook token to fall back to here.
        accessToken: null,
      }),
    );

    // Test run: record the outcome on the recipient row and stop — no thread,
    // message, or link rows, so customer email history stays clean.
    if (testEmail) {
      await supabaseServer
        .from("email_send_job_recipients")
        .update({
          status: "sent",
          sent_at: sent.sentAt,
          personalized_subject: subject,
          personalized_body: bodyContent,
          error_text: null,
        })
        .eq("id", r.id);
      result.sent++;
      return;
    }

    const { data: thread, error: threadErr } = await supabaseServer
      .from("email_threads")
      .upsert(
        {
          account_id: job.account_id,
          customer_type: r.customer_type,
          customer_ref: r.customer_ref,
          customer_name: name,
          conversation_id: sent.conversationId,
          subject,
          last_message_at: sent.sentAt,
          last_direction: "sent",
          last_preview: bodyContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
        },
        { onConflict: "account_id,conversation_id" },
      )
      .select("id")
      .single();
    if (threadErr || !thread) {
      throw new Error(`Thread upsert failed: ${threadErr?.message ?? "unknown"}`);
    }

    const { error: msgErr } = await supabaseServer.from("email_messages").insert({
      id: messageId,
      thread_id: thread.id,
      account_id: job.account_id,
      direction: "sent",
      graph_message_id: sent.graphMessageId,
      internet_message_id: sent.internetMessageId,
      conversation_id: sent.conversationId,
      from_address: sent.fromAddress ?? sender.fromEmail,
      to_addresses: [{ address: r.customer_email, name }],
      cc_addresses: ccRecipients,
      subject,
      body_text: bodyContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      body_html: tracked.html,
      body_preview: bodyContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
      sent_at: sent.sentAt,
    });
    if (msgErr) throw new Error(`Message insert failed: ${msgErr.message}`);

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

    await supabaseServer
      .from("email_send_job_recipients")
      .update({
        status: "sent",
        sent_at: sent.sentAt,
        message_id: messageId,
        personalized_subject: subject,
        personalized_body: bodyContent,
        error_text: null,
      })
      .eq("id", r.id);
    result.sent++;
  } catch (e) {
    await supabaseServer
      .from("email_send_job_recipients")
      .update({
        status: "failed",
        error_text: e instanceof Error ? e.message : String(e),
        personalized_subject: subject,
      })
      .eq("id", r.id);
    result.failed++;
  }
}

/**
 * Retry a Resend send on rate limiting (429) with a short backoff. Anything
 * else fails immediately — a bad address or rejected payload won't improve
 * on retry.
 */
async function withResendRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= delays.length || !/\(429\)|rate.?limit/i.test(msg)) throw e;
      await new Promise((res) => setTimeout(res, delays[attempt]));
    }
  }
}

/**
 * A pending row claimed more than RECLAIM_AFTER_MS ago belonged to a worker
 * that died mid-send. We can't know whether Resend accepted the email before
 * the crash, so re-sending risks a duplicate — mark it failed with a clear
 * reason instead, and let a human decide.
 */
async function failInterruptedClaims(): Promise<number> {
  const cutoff = new Date(Date.now() - RECLAIM_AFTER_MS).toISOString();
  const { data } = await supabaseServer
    .from("email_send_job_recipients")
    .update({
      status: "failed",
      error_text: "Interrupted mid-send — not retried automatically to avoid a duplicate email",
    })
    .eq("status", "pending")
    .not("claimed_at", "is", null)
    .lt("claimed_at", cutoff)
    .select("id");
  return (data ?? []).length;
}

async function skipRemaining(jobId: string, reason: string): Promise<void> {
  await supabaseServer
    .from("email_send_job_recipients")
    .update({ status: "skipped", error_text: reason })
    .eq("job_id", jobId)
    .eq("status", "pending");
}

/** Roll up recipient outcomes onto the job row and close it. */
async function finalizeJob(jobId: string, status: "completed" | "cancelled"): Promise<void> {
  const counts = await recipientCounts(jobId);
  await supabaseServer
    .from("email_send_jobs")
    .update({
      status,
      sent_count: counts.sent,
      failed_count: counts.failed + counts.skipped,
      completed_at: new Date().toISOString(),
      error_summary:
        counts.failed > 0 ? `${counts.failed} failed, ${counts.skipped} skipped` : null,
    })
    .eq("id", jobId);
}

export async function recipientCounts(jobId: string): Promise<{
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  // One job is at most a few thousand rows — a single status-only select and
  // an in-memory tally beats four count round-trips.
  const { data } = await supabaseServer
    .from("email_send_job_recipients")
    .select("status")
    .eq("job_id", jobId)
    .limit(20000);
  const rows = (data as Array<{ status: string }> | null) ?? [];
  const tally = { total: rows.length, pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of rows) {
    if (r.status === "pending") tally.pending++;
    else if (r.status === "sent") tally.sent++;
    else if (r.status === "failed") tally.failed++;
    else if (r.status === "skipped") tally.skipped++;
  }
  return tally;
}

async function loadContactsFor(rows: RecipientRow[]): Promise<Map<string, ContactRow>> {
  const out = new Map<string, ContactRow>();
  const wholesale = rows.filter((r) => r.customer_type === "wholesale").map((r) => r.customer_ref);
  const d2c = rows.filter((r) => r.customer_type === "d2c").map((r) => r.customer_ref);

  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return isFinite(n) ? n : null;
  };

  const load = async (view: string, refCol: string, refs: string[], type: "wholesale" | "d2c") => {
    if (refs.length === 0) return;
    const { data } = await supabaseServer
      .from(view)
      .select(
        `${refCol}, email, customer_name, billto_city, billto_state, primary_channel, lifetime_revenue, order_count, last_order_date`,
      )
      .in(refCol, refs);
    for (const r of ((data as Array<Record<string, unknown>> | null) ?? [])) {
      out.set(`${type}:${r[refCol] as string}`, {
        email: primaryEmail(r.email as string | null),
        name: (r.customer_name as string | null) ?? null,
        city: (r.billto_city as string | null) ?? null,
        state: (r.billto_state as string | null) ?? null,
        channel: (r.primary_channel as string | null) ?? null,
        lifetime_revenue: num(r.lifetime_revenue),
        lifetime_orders: num(r.order_count),
        last_order_date: (r.last_order_date as string | null) ?? null,
      });
    }
  };

  await load("customer_contact_summary", "customerid", wholesale, "wholesale");
  await load("d2c_customer_contact", "person_key", d2c, "d2c");
  return out;
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
        /* worker records its own outcomes */
      }
    }
  };
  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(pool);
}
