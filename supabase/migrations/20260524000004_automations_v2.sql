-- Automations v2: redesign around (trigger -> sequence of template-based steps).
--
-- Replaces the v1 single-shot scheme (automation_settings + per-workflow
-- *_sends tables) with a general model:
--
--   automations            : the definition (name, trigger, sender, enabled).
--   automation_steps       : ordered sequence of (template, delay_days).
--   automation_enrollments : per-customer state machine for an automation.
--   automation_step_sends  : log of every step send for forensics.
--
-- The v1 tables (automation_settings, d2c_reengagement_sends) had no data
-- because the v1 d2c_reengagement automation shipped disabled and never ran
-- — safe to drop.

create extension if not exists "pgcrypto";

-- ── Drop v1 tables + any partial-state from earlier v2 attempts ─────────────
-- Earlier in development there was an `automations` table that matched v1's
-- automation_settings schema (no trigger_type column). The CREATE IF NOT
-- EXISTS below would otherwise be a no-op and the trigger_type index would
-- fail. Dropping CASCADE wipes the table cleanly — v1 only held a seed row
-- with no customer data.
drop table if exists automation_step_sends    cascade;
drop table if exists automation_enrollments   cascade;
drop table if exists automation_steps         cascade;
drop table if exists automations              cascade;
drop table if exists d2c_reengagement_sends   cascade;
drop table if exists automation_settings      cascade;

-- ── automations ──────────────────────────────────────────────────────────────
create table if not exists automations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  enabled         boolean not null default false,
  -- Recognized triggers: 'd2c_at_risk', 'wholesale_at_risk'. trigger_config
  -- holds the trigger-specific params; { "days_inactive": 180, "lookback_days": 30 } for the *_at_risk types.
  trigger_type    text not null check (trigger_type in ('d2c_at_risk','wholesale_at_risk','manual')),
  trigger_config  jsonb not null default '{}'::jsonb,
  sender_user_id  uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_automations_updated on automations;
create trigger trg_automations_updated
  before update on automations
  for each row execute function set_updated_at();

create index if not exists idx_automations_trigger
  on automations (trigger_type, enabled);

-- ── automation_steps ─────────────────────────────────────────────────────────
create table if not exists automation_steps (
  id              uuid primary key default gen_random_uuid(),
  automation_id   uuid not null references automations(id) on delete cascade,
  step_order      integer not null,
  template_id     uuid not null references user_email_templates(id) on delete restrict,
  -- Days after the prior step (or after enrollment, for step 1). 0 = send now.
  delay_days      integer not null default 0 check (delay_days >= 0),
  created_at      timestamptz not null default now(),
  unique (automation_id, step_order)
);

create index if not exists idx_automation_steps_automation
  on automation_steps (automation_id, step_order);

-- ── automation_enrollments ──────────────────────────────────────────────────
-- One row per (automation, customer). Drives the state machine.
create table if not exists automation_enrollments (
  id                uuid primary key default gen_random_uuid(),
  automation_id     uuid not null references automations(id) on delete cascade,
  customer_type     text not null check (customer_type in ('wholesale','d2c')),
  customer_ref      text not null,
  customer_name     text,
  customer_email    text,
  enrolled_at       timestamptz not null default now(),
  -- The next step order we'll attempt to send (1 = step 1; null = sequence complete).
  next_step_order   integer,
  next_send_at      timestamptz,
  status            text not null default 'enrolled'
                      check (status in ('enrolled','completed','paused','unsubscribed','failed')),
  completed_at      timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  unique (automation_id, customer_type, customer_ref)
);

create index if not exists idx_automation_enrollments_due
  on automation_enrollments (status, next_send_at);

-- ── automation_step_sends ───────────────────────────────────────────────────
create table if not exists automation_step_sends (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references automation_enrollments(id) on delete cascade,
  step_id         uuid not null references automation_steps(id) on delete restrict,
  step_order      integer not null,
  message_id      uuid references email_messages(id) on delete set null,
  status          text not null check (status in ('sent','failed','skipped')),
  error_text      text,
  sent_at         timestamptz not null default now()
);

create index if not exists idx_automation_step_sends_enrollment
  on automation_step_sends (enrollment_id, sent_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table automations              enable row level security;
alter table automation_steps         enable row level security;
alter table automation_enrollments   enable row level security;
alter table automation_step_sends    enable row level security;

drop policy if exists "admin automations"        on automations;
drop policy if exists "admin automation steps"   on automation_steps;
drop policy if exists "admin enrollments"        on automation_enrollments;
drop policy if exists "admin step sends"         on automation_step_sends;

create policy "admin automations" on automations
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());
create policy "admin automation steps" on automation_steps
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());
create policy "admin enrollments" on automation_enrollments
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());
create policy "admin step sends" on automation_step_sends
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

-- ── Seed a starter D2C re-engagement automation ─────────────────────────────
-- We don't seed any steps here — the user picks the template on /automations.
-- (A separate seed of a "D2C re-engagement" template happens via the app's
-- /email-templates page or another migration.)
insert into automations (name, description, enabled, trigger_type, trigger_config)
values (
  'D2C re-engagement',
  'Re-engage D2C customers shortly after they cross the at-risk threshold.',
  false,
  'd2c_at_risk',
  '{"days_inactive": 180, "lookback_days": 30}'::jsonb
)
on conflict do nothing;
