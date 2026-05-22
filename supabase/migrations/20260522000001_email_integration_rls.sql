-- RLS policies for the email integration tables.
-- Default posture: each portal user can only see their own mailbox + threads +
-- messages. Owners & admins can see everything (override policy).
-- Server-side code uses the service-role key and bypasses RLS regardless.

alter table user_email_accounts        enable row level security;
alter table email_threads              enable row level security;
alter table email_messages             enable row level security;
alter table email_send_jobs            enable row level security;
alter table email_send_job_recipients  enable row level security;

-- Helper: is the current auth user an owner or admin in profiles?
-- SECURITY DEFINER avoids the recursion that would happen if profiles RLS
-- referenced any of the email tables in turn.
create or replace function auth_is_admin() returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and access in ('owner','admin')
  );
$$;

revoke all on function auth_is_admin() from public;
grant execute on function auth_is_admin() to authenticated;

-- ── user_email_accounts ──────────────────────────────────────────────────────
drop policy if exists "own email account"   on user_email_accounts;
drop policy if exists "admin email account" on user_email_accounts;

create policy "own email account" on user_email_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admin email account" on user_email_accounts
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());

-- ── email_threads ────────────────────────────────────────────────────────────
drop policy if exists "own threads"   on email_threads;
drop policy if exists "admin threads" on email_threads;

create policy "own threads" on email_threads
  for all to authenticated
  using (
    account_id in (select id from user_email_accounts where user_id = auth.uid())
  )
  with check (
    account_id in (select id from user_email_accounts where user_id = auth.uid())
  );

create policy "admin threads" on email_threads
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());

-- ── email_messages ───────────────────────────────────────────────────────────
drop policy if exists "own messages"   on email_messages;
drop policy if exists "admin messages" on email_messages;

create policy "own messages" on email_messages
  for all to authenticated
  using (
    account_id in (select id from user_email_accounts where user_id = auth.uid())
  )
  with check (
    account_id in (select id from user_email_accounts where user_id = auth.uid())
  );

create policy "admin messages" on email_messages
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());

-- ── email_send_jobs ──────────────────────────────────────────────────────────
drop policy if exists "own send jobs"   on email_send_jobs;
drop policy if exists "admin send jobs" on email_send_jobs;

create policy "own send jobs" on email_send_jobs
  for all to authenticated
  using (
    account_id in (select id from user_email_accounts where user_id = auth.uid())
  )
  with check (
    account_id in (select id from user_email_accounts where user_id = auth.uid())
  );

create policy "admin send jobs" on email_send_jobs
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());

-- ── email_send_job_recipients ────────────────────────────────────────────────
drop policy if exists "own send recipients"   on email_send_job_recipients;
drop policy if exists "admin send recipients" on email_send_job_recipients;

create policy "own send recipients" on email_send_job_recipients
  for all to authenticated
  using (
    job_id in (
      select j.id from email_send_jobs j
      join user_email_accounts a on a.id = j.account_id
      where a.user_id = auth.uid()
    )
  )
  with check (
    job_id in (
      select j.id from email_send_jobs j
      join user_email_accounts a on a.id = j.account_id
      where a.user_id = auth.uid()
    )
  );

create policy "admin send recipients" on email_send_job_recipients
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());
