import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { normalizeEmail } from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

/** Guard rails — results reporting reads recipient rows in bulk. */
const MAX_JOBS = 100;
const MAX_RECIPIENTS = 20000;
const CHUNK = 200;

/**
 * One bulk-send campaign, shaped to line up with automation cohorts on the
 * combined results page: same outcome idea (each recipient counts once, most
 * committed first: clicked > no action, with unsubscribed pulled out), so the
 * two kinds of send are comparable at a glance.
 */
type CampaignRow = {
  key: string;
  name: string;
  subject: string;
  date: string;
  isTest: boolean;
  /** Recipients the mail actually went to (skipped/failed excluded). */
  size: number;
  sent: number;
  skipped: number;
  failed: number;
  opened: number;
  clicked: number;
  /** Recipients who unsubscribed or complained AFTER this campaign went out. */
  unsubscribed: number;
  noAction: number;
};

/**
 * GET /api/email/campaign-results
 *
 * One row per bulk send job with its engagement mix. Aggregated in JS from
 * bulk queries (job → recipients → messages → opens/clicks), same approach as
 * the cohorts endpoint — PostgREST can't express the join chain.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  /* 1. Jobs, newest first. Includes legacy Outlook sends — they recorded the
        same job/recipient/message rows. */
  const { data: jobRows, error: jobErr } = await supabaseServer
    .from("email_send_jobs")
    .select("id, created_at, status, subject_template, block_template_id, test_email")
    .in("status", ["completed", "in_progress", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(MAX_JOBS);
  if (jobErr) {
    // test_email may not be migrated yet — retry without it.
    const retry = await supabaseServer
      .from("email_send_jobs")
      .select("id, created_at, status, subject_template, block_template_id")
      .in("status", ["completed", "in_progress", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(MAX_JOBS);
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
    return NextResponse.json({ campaigns: await build(retry.data ?? []) });
  }
  return NextResponse.json({ campaigns: await build(jobRows ?? []) });
}

type JobRow = {
  id: string;
  created_at: string;
  status: string;
  subject_template: string | null;
  block_template_id: string | null;
  test_email?: string | null;
};

async function build(jobsRaw: unknown[]): Promise<CampaignRow[]> {
  const jobs = jobsRaw as JobRow[];
  if (jobs.length === 0) return [];

  /* 2. Template names, so a campaign reads as "Prebook Sassy Holiday" rather
        than its subject line. */
  const tplIds = [...new Set(jobs.map((j) => j.block_template_id).filter(Boolean))] as string[];
  const tplNames = new Map<string, string>();
  if (tplIds.length > 0) {
    const { data } = await supabaseServer
      .from("email_templates")
      .select("id, name")
      .in("id", tplIds);
    for (const t of ((data as Array<{ id: string; name: string }> | null) ?? [])) {
      tplNames.set(t.id, t.name);
    }
  }

  /* 3. Recipients. */
  type Recipient = {
    job_id: string;
    status: string;
    message_id: string | null;
    customer_email: string | null;
  };
  const recipients: Recipient[] = [];
  const jobIds = jobs.map((j) => j.id);
  for (let i = 0; i < jobIds.length && recipients.length < MAX_RECIPIENTS; i += 20) {
    const { data } = await supabaseServer
      .from("email_send_job_recipients")
      .select("job_id, status, message_id, customer_email")
      .in("job_id", jobIds.slice(i, i + 20))
      .limit(MAX_RECIPIENTS - recipients.length);
    recipients.push(...(((data as Recipient[] | null) ?? [])));
  }

  /* 4. Opens + clicks for the messages those sends produced. Both counters are
        trigger-maintained, so reading the message/link rows is enough. */
  const messageIds = recipients.map((r) => r.message_id).filter((m): m is string => !!m);
  const openedMessages = new Set<string>();
  const clickedMessages = new Set<string>();
  for (let i = 0; i < messageIds.length; i += CHUNK) {
    const slice = messageIds.slice(i, i + CHUNK);
    const { data: opened } = await supabaseServer
      .from("email_messages")
      .select("id")
      .in("id", slice)
      .gt("open_count", 0);
    for (const m of ((opened as Array<{ id: string }> | null) ?? [])) openedMessages.add(m.id);

    const { data: clicked } = await supabaseServer
      .from("email_message_links")
      .select("message_id")
      .in("message_id", slice)
      .gt("click_count", 0);
    for (const l of ((clicked as Array<{ message_id: string }> | null) ?? [])) {
      clickedMessages.add(l.message_id);
    }
  }

  /* 5. Post-send opt-outs: an unsubscribe/complaint recorded AFTER the
        campaign went out, for an address it was sent to, is that campaign's
        outcome. (The suppression list is small — load once.) */
  const { data: unsubRows } = await supabaseServer
    .from("email_unsubscribes")
    .select("email, source, created_at")
    .in("source", ["link", "complaint"])
    .limit(5000);
  const unsubByEmail = new Map<string, string>(); // email → created_at
  for (const u of ((unsubRows as Array<{ email: string; created_at: string }> | null) ?? [])) {
    unsubByEmail.set(normalizeEmail(u.email), u.created_at);
  }

  /* 6. Roll up per job. */
  const byJob = new Map<string, CampaignRow>();
  for (const j of jobs) {
    byJob.set(j.id, {
      key: j.id,
      name:
        (j.block_template_id ? tplNames.get(j.block_template_id) : null) ??
        (j.subject_template ?? "Untitled campaign").slice(0, 80),
      subject: (j.subject_template ?? "").slice(0, 120),
      date: j.created_at,
      isTest: !!j.test_email,
      size: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
      noAction: 0,
    });
  }

  for (const r of recipients) {
    const row = byJob.get(r.job_id);
    if (!row) continue;
    if (r.status === "skipped") { row.skipped++; continue; }
    if (r.status === "failed") { row.failed++; continue; }
    if (r.status !== "sent") continue; // pending — still in flight

    row.size++;
    row.sent++;
    const opened = !!r.message_id && openedMessages.has(r.message_id);
    const clicked = !!r.message_id && clickedMessages.has(r.message_id);
    if (opened) row.opened++;

    const unsubAt = unsubByEmail.get(normalizeEmail(r.customer_email ?? ""));
    if (unsubAt && unsubAt >= row.date) row.unsubscribed++;
    else if (clicked) row.clicked++;
    else row.noAction++;
  }

  // Jobs whose recipients were all skipped/failed still show (size 0).
  return [...byJob.values()];
}
