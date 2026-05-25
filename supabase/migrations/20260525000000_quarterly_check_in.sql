-- Quarterly check-in: public form responses from customers who follow
-- the link in their re-engagement / quarterly email.
--
-- The page is unauthenticated (anyone with the link can submit), so the
-- INSERT path runs through a service-role API route — there's no INSERT
-- policy. SELECT is admin-only so portal users can review responses but
-- nobody else can read them.

create extension if not exists "pgcrypto";

create table if not exists quarterly_check_in_responses (
  id                 uuid primary key default gen_random_uuid(),
  customer_type      text check (customer_type in ('wholesale','d2c')),
  customer_ref       text,
  customer_name      text,
  customer_email     text,

  -- Form fields
  rating             integer check (rating is null or rating between 1 and 5),
  what_went_well     text,
  what_didnt_go_well text,
  what_to_improve    text,

  -- Metadata for diagnostics
  ip                 inet,
  user_agent         text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_qci_created_at
  on quarterly_check_in_responses (created_at desc);

create index if not exists idx_qci_customer
  on quarterly_check_in_responses (customer_type, customer_ref)
  where customer_ref is not null;

alter table quarterly_check_in_responses enable row level security;

drop policy if exists "admin read responses" on quarterly_check_in_responses;
create policy "admin read responses" on quarterly_check_in_responses
  for select to authenticated
  using (auth_is_admin());
