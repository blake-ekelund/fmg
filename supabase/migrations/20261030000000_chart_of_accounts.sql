-- Chart of accounts workspace (Accounting → Chart of Accounts).
--
-- Holds two charts side by side while FMG moves from QuickBooks Desktop to
-- QuickBooks Online:
--   chart = 'current'   the QBD chart as exported (Account Listing report),
--                       replaced wholesale on each import;
--   chart = 'proposed'  the clean QBO chart Julie, Blake and the CPA edit row
--                       by row — status (keep / rename / merge / new / retire),
--                       business unit for the per-brand Sales/COGS accounts, and
--                       maps_from = the current accounts that land in it.
--
-- Read and written only through /api/accounting/coa (service role, owner/admin
-- for writes), so RLS is on with no policies.

create table if not exists public.coa_accounts (
  id               uuid primary key default gen_random_uuid(),
  chart            text not null check (chart in ('current', 'proposed')),
  number           text,
  name             text not null,
  parent           text,               -- "Parent:Child" path of the parent, no numbers
  full_name        text,               -- current chart: QuickBooks' full name (the mapping key)
  type             text not null,
  detail_type      text,
  balance          numeric,            -- current chart only, as of the export
  description      text,
  business_unit    text check (business_unit in ('FMG', 'Natural Inspirations', 'Sassy and Co')),
  status           text check (status in ('keep', 'rename', 'merge', 'new', 'retire')),
  maps_from        text[] not null default '{}',
  notes            text,
  fishbowl_default boolean not null default false,
  sort             integer not null default 0,
  source           text,               -- file name the current chart came from
  updated_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists coa_accounts_chart_sort_idx on public.coa_accounts (chart, sort);

alter table public.coa_accounts enable row level security;

comment on table public.coa_accounts is
  'Chart of accounts workspace for the QBD → QBO move: the current QuickBooks Desktop chart (imported) and the proposed QuickBooks Online chart (edited on /accounting/chart-of-accounts).';
