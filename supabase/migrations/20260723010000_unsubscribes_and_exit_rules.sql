-- Two things automated email can't ship without: a way out for the recipient,
-- and a way out for the enrollment.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Suppression list
--
-- There was no unsubscribe anywhere in the system: no table, no link in
-- outbound mail, and no check before sending. automation_enrollments.status
-- has always allowed 'unsubscribed' but nothing ever set it.
--
-- One row per address, lowercased. Keyed by email rather than customer id on
-- purpose: the same person can appear as both a D2C and a wholesale contact,
-- and opting out must cover both. customer_type/ref are recorded only for
-- traceability of where the opt-out came from.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists email_unsubscribes (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  customer_type  text check (customer_type in ('wholesale', 'd2c')),
  customer_ref   text,
  -- 'link'   — recipient clicked unsubscribe
  -- 'manual' — added by staff
  -- 'bounce' — hard bounce / complaint
  source         text not null default 'link' check (source in ('link', 'manual', 'bounce')),
  reason         text,
  automation_id  uuid references automations(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Suppression is checked on every enrollment pass and before every send, so
-- the lookup must be cheap and case-insensitive.
create unique index if not exists idx_email_unsubscribes_email
  on email_unsubscribes (lower(email));

-- ─────────────────────────────────────────────────────────────────────
-- 2. Exit rules
--
-- An enrollment could only ever end by finishing every step. There was no way
-- to say "stop emailing this customer because the thing we wanted happened" —
-- so a customer who ordered on day 2 kept receiving win-back mail for weeks.
--
-- 'exited' distinguishes "left early because a rule fired" from 'completed'
-- ("received the whole sequence"), which matters when reading the stats on the
-- automations cards.
-- ─────────────────────────────────────────────────────────────────────

alter table automation_enrollments
  add column if not exists exit_reason text;

alter table automation_enrollments
  drop constraint if exists automation_enrollments_status_check;

alter table automation_enrollments
  add constraint automation_enrollments_status_check
  check (status in ('enrolled', 'completed', 'paused', 'unsubscribed', 'failed', 'exited'));
