-- Automation framework + D2C re-engagement automation.
--
-- automation_settings is a small key/value-ish table — one row per
-- named automation, holding its enabled flag, sender, and JSON config.
-- We start with one row ('d2c_reengagement') and add more as we build
-- additional automations.
--
-- d2c_reengagement_sends tracks every D2C customer the automation has
-- emailed. Unique on person_key so a single customer can only receive
-- the re-engagement once (manual sends are still allowed).

create extension if not exists "pgcrypto";

create table if not exists automation_settings (
  name           text primary key,
  enabled        boolean not null default false,
  sender_user_id uuid references profiles(id) on delete set null,
  config         jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_automation_settings_updated on automation_settings;
create trigger trg_automation_settings_updated
  before update on automation_settings
  for each row execute function set_updated_at();

create table if not exists d2c_reengagement_sends (
  id              uuid primary key default gen_random_uuid(),
  person_key      text not null unique,
  customer_name   text,
  customer_email  text,
  message_id      uuid references email_messages(id) on delete set null,
  discount_code   text,
  status          text not null default 'sent'
                    check (status in ('sent','failed','skipped')),
  error_text      text,
  sent_at         timestamptz not null default now()
);

create index if not exists idx_d2c_reengagement_sends_sent_at
  on d2c_reengagement_sends (sent_at desc);

-- Default settings row for the d2c re-engagement automation.
insert into automation_settings (name, enabled, config)
values (
  'd2c_reengagement',
  false,
  '{"trigger_days": 180, "lookback_days": 30, "discount_code": "WELCOMEBACK15", "subject": "We miss you, {{firstName}} — 15% off your next order", "body": "Hi {{firstName}},\n\nIt''s been a few months since your last order, and I just wanted to check in.\n\nIf you''ve been thinking about restocking, here''s 15% off — no minimum, valid for the next 30 days:\n\nCode: WELCOMEBACK15\n\nShop now: https://naturalinspirations.com\n\nHope to see you soon,\n{{senderFirstName}}"}'::jsonb
)
on conflict (name) do nothing;

-- RLS: admin-only. Service role bypasses anyway (cron uses it).
alter table automation_settings enable row level security;
alter table d2c_reengagement_sends enable row level security;

drop policy if exists "admin only settings" on automation_settings;
create policy "admin only settings" on automation_settings
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());

drop policy if exists "admin only sends" on d2c_reengagement_sends;
create policy "admin only sends" on d2c_reengagement_sends
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());
