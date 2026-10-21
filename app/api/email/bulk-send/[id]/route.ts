import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { recipientCounts } from "@/lib/email/bulkSend";

export const runtime = "nodejs";

/** Well past the 300s an Outlook send's function may run. */
const STALE_OUTLOOK_MS = 10 * 60 * 1000;

/**
 * GET /api/email/bulk-send/{id} — progress for the sender's toast (lib/email/trackSendJob.ts).
 * Counts come from the recipient rows (the source of truth), not the job's
 * cached counters, so progress moves while the worker is mid-run.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { data: job, error } = await supabaseServer
    .from("email_send_jobs")
    .select("id, status, transport, target_count, sent_count, failed_count, created_at, started_at, completed_at, error_summary")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Outlook sends run inside the request's after() hook, capped at the
  // function's 300s. One still "in progress" well past that was killed
  // mid-run: close it out so the sender's toast doesn't spin forever. Rows
  // never reached are failed, not retried — same no-double-send rule as the
  // Resend worker.
  if (
    job.transport === "outlook" &&
    job.status === "in_progress" &&
    job.started_at &&
    Date.now() - new Date(job.started_at).getTime() > STALE_OUTLOOK_MS
  ) {
    await supabaseServer
      .from("email_send_job_recipients")
      .update({ status: "failed", error_text: "Send was interrupted — not retried automatically to avoid a duplicate email" })
      .eq("job_id", id)
      .eq("status", "pending");
    await supabaseServer
      .from("email_send_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString(), error_summary: "Interrupted before every email was sent" })
      .eq("id", id)
      .eq("status", "in_progress");
    job.status = "completed";
  }

  const counts = await recipientCounts(id);

  // Rep sends have no recipient rows (reps aren't customers): their progress
  // is the job's own counters and their failures are error_summary lines.
  if (counts.total === 0 && (job.target_count ?? 0) > 0) {
    const sent = job.sent_count ?? 0;
    const failed = job.failed_count ?? 0;
    const total = job.target_count as number;
    const done = job.status === "completed" || job.status === "cancelled" || job.status === "failed";
    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      total,
      pending: done ? 0 : Math.max(0, total - sent - failed),
      sent,
      failed,
      // Reps a cancel stopped before their turn.
      skipped: done ? Math.max(0, total - sent - failed) : 0,
      started_at: job.started_at,
      completed_at: job.completed_at,
      error_summary: job.error_summary,
      failed_sample: ((job.error_summary as string | null) ?? "")
        .split("\n")
        .filter(Boolean)
        .slice(0, 5)
        .map((line) => ({ customer_name: null, customer_email: "", error_text: line })),
    });
  }

  // A small sample of failures so the UI can show *why*, not just how many.
  const { data: failures } = await supabaseServer
    .from("email_send_job_recipients")
    .select("customer_name, customer_email, error_text")
    .eq("job_id", id)
    .eq("status", "failed")
    .limit(5);

  return NextResponse.json({
    job_id: job.id,
    status: job.status,
    total: counts.total,
    pending: counts.pending,
    sent: counts.sent,
    failed: counts.failed,
    skipped: counts.skipped,
    started_at: job.started_at,
    completed_at: job.completed_at,
    error_summary: job.error_summary,
    failed_sample: failures ?? [],
  });
}

/**
 * DELETE /api/email/bulk-send/{id} — cancel a queued or running job.
 * Recipients already sent stay sent; everyone still pending is skipped the
 * next time the worker looks at the job.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await supabaseServer
    .from("email_send_jobs")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["pending", "in_progress"])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Job is already finished — nothing to cancel." },
      { status: 409 },
    );
  }

  // Skip everyone not yet claimed by the worker so the UI settles immediately.
  // Rows a worker is actively sending (claimed) finish on their own; the
  // worker's own cancel check stops the job at the next chunk boundary.
  await supabaseServer
    .from("email_send_job_recipients")
    .update({ status: "skipped", error_text: "Cancelled before send" })
    .eq("job_id", id)
    .eq("status", "pending")
    .is("claimed_at", null);

  return NextResponse.json({ ok: true, status: "cancelled" });
}
