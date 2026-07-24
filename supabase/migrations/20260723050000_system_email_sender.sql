-- Which mailbox automated email goes out from.
--
-- Three senders had no user to attribute to — the automations cron (when the
-- automation itself has no sender_user_id), the Fishbowl digest, and storefront
-- order notifications — and all three picked the sender with
--
--   select user_id from user_email_accounts where status = 'connected' limit 1
--
-- with no ORDER BY. That is non-deterministic in Postgres: it returns whatever
-- row the planner reaches first, which can change between runs as the table
-- changes. With one mailbox connected it looks stable; the moment a second
-- person connects, company mail can start going out from their address with
-- nobody having changed a setting.
--
-- This makes the choice explicit and admin-owned. The resolver
-- (lib/email/systemSender.ts) prefers this row, and only falls back to the
-- oldest connected mailbox — now deterministically ordered — when it is unset
-- or points at a mailbox that has since disconnected.

create table if not exists email_settings (
  -- Single-row table. The CHECK pins the primary key so a second row can't be
  -- inserted and silently shadow the first.
  id                     boolean primary key default true check (id),
  system_sender_user_id  uuid references profiles(id) on delete set null,
  updated_at             timestamptz not null default now(),
  updated_by             uuid references profiles(id) on delete set null
);

insert into email_settings (id) values (true)
on conflict (id) do nothing;

drop trigger if exists trg_email_settings_updated on email_settings;
create trigger trg_email_settings_updated
  before update on email_settings
  for each row execute function set_updated_at();

-- Reads and writes go through the service-role key in /api/email/system-sender,
-- which gates on an owner/admin session. Deny direct client access.
alter table email_settings enable row level security;
