-- Amazon settlement journal entries (Accounting → Amazon Payments).
--
-- One row per Amazon settlement period, built from the settlement flat file by
-- lib/amazonSettlement.ts: the bookkeeping columns, the total Amazon reported,
-- and the per-line-type breakdown behind them (`groups`). Re-uploading the same
-- settlement replaces its row (unique settlement_id).
--
-- Only read/written by the service-role API route /api/accounting/amazon-settlements
-- (owner/admin, gated on the page) and Sage. RLS on with NO policies.

create table if not exists amazon_settlements (
  id              uuid primary key default gen_random_uuid(),
  settlement_id   text not null unique,
  start_date      date,
  end_date        date,
  deposit_date    date,
  currency        text not null default 'USD',
  sales           numeric(14, 2) not null default 0,
  shipping        numeric(14, 2) not null default 0,
  amazon_fees     numeric(14, 2) not null default 0,
  advertising     numeric(14, 2) not null default 0,
  promo_rebates   numeric(14, 2) not null default 0,
  fba_fees        numeric(14, 2) not null default 0,
  refunded_sales  numeric(14, 2) not null default 0,
  other           numeric(14, 2) not null default 0,
  total           numeric(14, 2) not null default 0,
  reported_total  numeric(14, 2),
  reconciles      boolean not null default true,
  line_count      integer not null default 0,
  groups          jsonb not null default '[]'::jsonb,
  file_name       text,
  uploaded_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists amazon_settlements_start_idx on amazon_settlements (start_date desc);

comment on table amazon_settlements is
  'Amazon settlement → journal entry rows for Accounting → Amazon Payments. Service-role only; RLS on with no policies.';

alter table amazon_settlements enable row level security;
