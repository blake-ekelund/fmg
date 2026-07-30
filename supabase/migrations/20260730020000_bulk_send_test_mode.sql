-- Test mode for queued bulk sends: when test_email is set, every recipient's
-- copy is rendered with that customer's real merge data but DELIVERED to this
-- address instead of the customer. Lets the sender proof a blast ("pick 5
-- customers, send all 5 copies to me") before running it live.
alter table email_send_jobs
  add column if not exists test_email text;
