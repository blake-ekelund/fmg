import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { resendConfigured } from "@/lib/email/sender";
import { resolveSystemSenderUserId } from "@/lib/email/systemSender";
import { renderBlocksToEmailHtml } from "@/lib/email/renderBlocks";
import { renderRawHtmlEmail } from "@/lib/email/rawHtml";
import { renderTextEmail } from "@/lib/email/renderText";
import { primaryEmail, parseEmailAddresses } from "@/lib/email/addresses";
import { findSuppressed, normalizeEmail } from "@/lib/email/unsubscribe";
import type { EmailBlock } from "@/components/templates/types";

export const runtime = "nodejs";
// Enqueue only snapshots rows — no sending happens here — but a 10k-recipient
// job still writes a lot of rows.
export const maxDuration = 120;

/** Queue cap. Far above any real blast; exists so a bug can't queue millions. */
const MAX_RECIPIENTS = 10_000;
/** PostgREST puts .in() lists in the URL — keep chunks well under the limit. */
const QUERY_CHUNK = 200;
const INSERT_CHUNK = 500;

type BulkSendRequest = {
  recipients: Array<{ customer_type: "wholesale" | "d2c"; customer_ref: string }>;
  /** Optional override; empty falls back to the template's own subject. */
  subject_template?: string;
  block_template_id: string;
  cc?: string;
  /**
   * Test mode: render each copy with the selected customer's real merge data
   * but deliver every one to this address instead of the customer. Nothing
   * reaches a customer and no thread/tracking history is written.
   */
  test_email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Contact = {
  email: string | null;
  name: string | null;
};

/**
 * POST /api/email/bulk-send
 *
 * Queue a designed-template blast for background delivery through Resend.
 * Snapshots the job + one row per recipient, marks the undeliverable ones
 * (no email / unsubscribed) immediately, kicks the worker, and returns the
 * job id for progress polling. Nothing is sent in this request.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!resendConfigured()) {
    return NextResponse.json(
      {
        error:
          "Bulk sending needs Resend configured (RESEND_API_KEY + RESEND_FROM_DOMAIN). Large blasts are not sent through Outlook.",
      },
      { status: 400 },
    );
  }

  let body: BulkSendRequest;
  try {
    body = (await request.json()) as BulkSendRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ error: "Pick at least one recipient" }, { status: 400 });
  }
  if (body.recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients (got ${body.recipients.length}, max ${MAX_RECIPIENTS}).` },
      { status: 400 },
    );
  }
  if (!body.block_template_id) {
    return NextResponse.json({ error: "Pick a designed template" }, { status: 400 });
  }

  const ccList = parseEmailAddresses(body.cc ?? null);
  if (ccList.length > 20) {
    return NextResponse.json(
      { error: `Too many Cc addresses (got ${ccList.length}, max 20).` },
      { status: 400 },
    );
  }

  const testEmail = (body.test_email ?? "").trim();
  if (testEmail && !EMAIL_RE.test(testEmail)) {
    return NextResponse.json(
      { error: "Enter a valid email address for the test run." },
      { status: 400 },
    );
  }
  // A misconfigured client could queue thousands of copies at one inbox.
  if (testEmail && body.recipients.length > 50) {
    return NextResponse.json(
      { error: `Test runs are capped at 50 customers (got ${body.recipients.length}). Pick a smaller sample.` },
      { status: 400 },
    );
  }

  // ── Render the template once; the worker merges per recipient ──
  const { data: tpl, error: tplErr } = await supabaseServer
    .from("email_templates")
    .select("name, subject, preview_text, source, blocks, raw_html, text_body, brand, from_name, reply_to")
    .eq("id", body.block_template_id)
    .maybeSingle();
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
  if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const previewText = (tpl.preview_text as string | null) ?? undefined;
  let html: string;
  if (tpl.source === "html") {
    const raw = (tpl.raw_html as string | null) ?? "";
    if (!raw.trim()) {
      return NextResponse.json({ error: `Template "${tpl.name}" has no HTML content yet.` }, { status: 400 });
    }
    html = renderRawHtmlEmail(raw, { previewText });
  } else if (tpl.source === "text") {
    const text = (tpl.text_body as string | null) ?? "";
    if (!text.trim()) {
      return NextResponse.json({ error: `Template "${tpl.name}" has no content yet.` }, { status: 400 });
    }
    html = renderTextEmail(text, { previewText });
  } else {
    const blocks = (tpl.blocks ?? []) as EmailBlock[];
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: `Template "${tpl.name}" has no content blocks yet.` }, { status: 400 });
    }
    html = renderBlocksToEmailHtml(blocks, { previewText });
  }

  const subjectTemplate =
    body.subject_template?.trim() || ((tpl.subject as string | null) ?? "").trim();
  if (!subjectTemplate) {
    return NextResponse.json(
      { error: "Subject is required — type one or set it on the template." },
      { status: 400 },
    );
  }

  // ── Attribution account for threads/messages ──
  // Threads hang off an email account row. Prefer the sender's own; fall back
  // to the designated system sender so a user without Outlook can still blast.
  const accountId = await resolveAccountId(user.id);
  if (!accountId) {
    return NextResponse.json(
      { error: "No email account found to attribute this send to. Connect an Outlook mailbox once, or set a system sender in Settings." },
      { status: 400 },
    );
  }

  // ── Snapshot recipients ──
  const wholesale = body.recipients.filter((r) => r.customer_type === "wholesale").map((r) => r.customer_ref);
  const d2c = body.recipients.filter((r) => r.customer_type === "d2c").map((r) => r.customer_ref);
  const contacts = new Map<string, Contact>();
  await loadContactsChunked(contacts, "customer_contact_summary", "customerid", wholesale, "wholesale");
  await loadContactsChunked(contacts, "d2c_customer_contact", "person_key", d2c, "d2c");

  const suppressed = await findSuppressed(
    [...contacts.values()].map((c) => c.email ?? "").filter(Boolean),
  );

  const { data: jobRow, error: jobErr } = await supabaseServer
    .from("email_send_jobs")
    .insert({
      account_id: accountId,
      transport: "resend",
      created_by: user.id,
      subject_template: subjectTemplate,
      body_template: html,
      target_count: body.recipients.length,
      block_template_id: body.block_template_id,
      cc_json: ccList.map((address) => ({ address })),
      brand: (tpl.brand as string | null) ?? null,
      from_name: (tpl.from_name as string | null) ?? null,
      reply_to: (tpl.reply_to as string | null) ?? null,
      test_email: testEmail || null,
      status: "pending",
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

  let queued = 0;
  let skippedNoEmail = 0;
  let skippedUnsubscribed = 0;
  // Dedupe by address so two customer records sharing an inbox get one email,
  // not two copies of the same blast.
  const seenAddresses = new Set<string>();
  let skippedDuplicate = 0;

  const rows = body.recipients.map((r) => {
    const contact = contacts.get(`${r.customer_type}:${r.customer_ref}`);
    const email = contact?.email ?? "";
    const base = {
      job_id: jobId,
      customer_type: r.customer_type,
      customer_ref: r.customer_ref,
      customer_email: email,
      customer_name: contact?.name ?? null,
      // NOT NULL columns; the worker overwrites them with the merged values.
      personalized_subject: subjectTemplate,
      personalized_body: "",
    };
    if (!email) {
      skippedNoEmail++;
      return { ...base, status: "skipped", error_text: "No email address on file" };
    }
    if (suppressed.has(normalizeEmail(email))) {
      skippedUnsubscribed++;
      return { ...base, status: "skipped", error_text: "Unsubscribed" };
    }
    // In a test run every copy goes to the tester, so a shared customer
    // address is not a duplicate delivery — keep all copies.
    if (!testEmail) {
      const norm = normalizeEmail(email);
      if (seenAddresses.has(norm)) {
        skippedDuplicate++;
        return { ...base, status: "skipped", error_text: "Duplicate address (another selected customer shares this email)" };
      }
      seenAddresses.add(norm);
    }
    queued++;
    return { ...base, status: "pending", error_text: null };
  });

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await supabaseServer
      .from("email_send_job_recipients")
      .insert(rows.slice(i, i + INSERT_CHUNK));
    if (error) {
      // Partial snapshot — kill the job so the worker never runs a half-queued
      // blast. Already-inserted rows cascade-delete with it.
      await supabaseServer.from("email_send_jobs").delete().eq("id", jobId);
      return NextResponse.json(
        { error: `Could not queue recipients: ${error.message}` },
        { status: 500 },
      );
    }
  }

  await kickWorker(request);

  return NextResponse.json({
    job_id: jobId,
    total: body.recipients.length,
    queued,
    skipped_no_email: skippedNoEmail,
    skipped_unsubscribed: skippedUnsubscribed,
    skipped_duplicate: skippedDuplicate,
    test_email: testEmail || null,
    transport: "resend",
  });
}

async function resolveAccountId(userId: string): Promise<string | null> {
  const { data: own } = await supabaseServer
    .from("user_email_accounts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (own?.id) return own.id as string;

  const systemUserId = await resolveSystemSenderUserId();
  if (!systemUserId) return null;
  const { data: sys } = await supabaseServer
    .from("user_email_accounts")
    .select("id")
    .eq("user_id", systemUserId)
    .maybeSingle();
  return (sys?.id as string | null) ?? null;
}

async function loadContactsChunked(
  out: Map<string, Contact>,
  view: string,
  refCol: string,
  refs: string[],
  type: "wholesale" | "d2c",
): Promise<void> {
  for (let i = 0; i < refs.length; i += QUERY_CHUNK) {
    const slice = refs.slice(i, i + QUERY_CHUNK);
    const { data } = await supabaseServer
      .from(view)
      .select(`${refCol}, email, customer_name`)
      .in(refCol, slice);
    for (const r of ((data as Array<Record<string, unknown>> | null) ?? [])) {
      out.set(`${type}:${r[refCol] as string}`, {
        email: primaryEmail(r.email as string | null),
        name: (r.customer_name as string | null) ?? null,
      });
    }
  }
}

/**
 * Start the worker now rather than waiting for the next cron tick. We only
 * need the request delivered — the worker is its own invocation — so abort our
 * side after a short wait. The 5-minute cron is the backstop if this is lost.
 */
async function kickWorker(request: Request): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const origin = new URL(request.url).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(`${origin}/api/cron/bulk-send`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
  } catch {
    /* aborted or unreachable — the cron picks the job up */
  } finally {
    clearTimeout(timer);
  }
}
