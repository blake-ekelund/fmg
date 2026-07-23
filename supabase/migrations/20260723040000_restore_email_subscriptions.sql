-- Restore inbound mail ingestion.
--
-- 20260722000000_email_outbound_only.sql dropped these columns on the premise
-- that nothing reads inbound mail. That premise no longer holds: automation
-- exit rules ("remove the customer if they reply") and cohort response rates
-- need to know when a customer writes back, and the only source of that is a
-- Graph webhook subscription on the connected mailbox.
--
-- Re-adding is safe and idempotent. Existing connected accounts come back with
-- NULLs and simply have no subscription until one is created — the renewal
-- cron and the connect flow both handle that.

alter table user_email_accounts
  add column if not exists subscription_id           text,
  add column if not exists subscription_expires_at   timestamptz,
  add column if not exists subscription_client_state text;

-- Matches the index dropped by the outbound-only migration; the renewal cron
-- scans for subscriptions nearing expiry.
create index if not exists idx_user_email_accounts_subscription
  on user_email_accounts (subscription_expires_at)
  where subscription_id is not null;
