-- Link each bulk send job back to the designed template it was sent from, so
-- the /templates library can show a "sends" count per template. Nullable: typed
-- one-off sends (no template) leave it null. Only sends made after this ships
-- are attributable — historical jobs stay null.

alter table email_send_jobs
  add column if not exists block_template_id uuid
    references email_templates(id) on delete set null;

create index if not exists idx_email_send_jobs_block_template
  on email_send_jobs (block_template_id);
