-- Email is outbound-only.
--
-- We send on a rep's behalf so the customer reorders or replies straight to
-- that rep's real mailbox. Nothing in the app reads inbound mail: the Graph
-- webhook subscription, its renewal cron, and the /inbox page are all gone.
--
-- This drops the columns that existed only to track that subscription. The
-- email_* tables themselves stay — they still hold outbound sends, which the
-- customer-detail Emails tab and the open/click tracking both depend on.

drop index if exists idx_user_email_accounts_subscription;

alter table user_email_accounts
  drop column if exists subscription_id,
  drop column if exists subscription_expires_at,
  drop column if exists subscription_client_state;
