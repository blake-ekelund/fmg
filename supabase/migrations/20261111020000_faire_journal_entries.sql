-- Accounting → Faire Payouts → Journal Entries.
--
-- Selecting payouts and clicking "Create journal entry" saves one entry here:
-- a numbered record (FAIRE-JE-0001…) with its debit/credit lines and a
-- SNAPSHOT of the payouts and orders it covers, so the documentation never
-- shifts if Faire later changes an order. Each payout belongs to at most one
-- entry (faire_payouts.journal_entry_id). "Entered in QBO" on the entry also
-- ticks its payouts.
--
-- Service-role only (/api/accounting/faire-journal-entries, owner/admin).

create sequence if not exists faire_journal_entry_seq;

create table if not exists faire_journal_entries (
  id              uuid primary key default gen_random_uuid(),
  seq             integer not null unique default nextval('faire_journal_entry_seq'),
  entry_date      date not null,
  memo            text not null,
  payout_dates    date[] not null,
  columns         jsonb not null,
  net             numeric(14, 2) not null,
  lines           jsonb not null,
  payouts         jsonb not null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  qbo_entered_at  timestamptz,
  qbo_entered_by  uuid references auth.users (id) on delete set null
);

create index if not exists faire_journal_entries_date_idx on faire_journal_entries (entry_date desc);

alter table faire_payouts
  add column if not exists journal_entry_id uuid references faire_journal_entries (id) on delete set null;

comment on table faire_journal_entries is
  'Faire journal entries (one or more payouts each), with lines + a snapshot of the payouts. Service-role only.';

alter table faire_journal_entries enable row level security;
