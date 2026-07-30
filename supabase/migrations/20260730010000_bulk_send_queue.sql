-- Bulk sends become a background queue processed in chunks by
-- /api/cron/bulk-send, instead of one long-running request. The enqueue
-- endpoint snapshots the job + every recipient up front; the worker claims
-- pending recipients in batches and sends them through Resend from the brand's
-- verified domain.

-- ── email_send_jobs: queue metadata ──────────────────────────────────────────
alter table email_send_jobs
  -- 'outlook' = the original synchronous /api/email/send path.
  -- 'resend'  = queued brand mail processed by the cron worker.
  add column if not exists transport text not null default 'outlook'
    check (transport in ('outlook','resend')),
  -- Who queued it (profiles.id). account_id stays the thread-attribution
  -- account; created_by is the human, which may differ once system senders
  -- are involved.
  add column if not exists created_by uuid references profiles(id) on delete set null,
  -- Cc applied to every recipient's copy: [{"address": "..."}].
  add column if not exists cc_json jsonb not null default '[]'::jsonb,
  -- Snapshot of the sender identity inputs at enqueue time. The worker feeds
  -- these to resolveSender() at send time, so env changes (domain, reply-to)
  -- apply to in-flight jobs the same way they do to automations.
  add column if not exists brand text,
  add column if not exists from_name text,
  add column if not exists reply_to text;

-- ── email_send_job_recipients: claim bookkeeping ─────────────────────────────
-- A row is claimed by setting claimed_at while status is still 'pending'
-- (no new status value, so the existing check constraint stands):
--   pending + claimed_at null  = waiting in the queue
--   pending + claimed_at set   = in flight with a worker
-- A pending row whose claim is older than the reclaim window was interrupted
-- mid-send; the worker marks it failed rather than re-sending, so a crash can
-- never double-deliver.
alter table email_send_job_recipients
  add column if not exists claimed_at timestamptz;

-- The worker's claim query: pending rows of one job, oldest first.
create index if not exists idx_email_send_job_recipients_queue
  on email_send_job_recipients (job_id, status)
  where status = 'pending';

-- The cron scans for jobs with work left.
create index if not exists idx_email_send_jobs_active
  on email_send_jobs (created_at)
  where status in ('pending','in_progress');
