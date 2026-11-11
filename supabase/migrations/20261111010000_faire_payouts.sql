-- Accounting → Faire Payouts: the "Entered in QBO" tick per payout.
--
-- The payouts themselves aren't stored — they're rebuilt from the Faire API
-- on every load (lib/fairePayoutsStore.ts). A payout is identified by the
-- Central-time day Faire paid its orders; this table only remembers which
-- payouts have had their journal entry entered in QuickBooks Online, and who
-- ticked it.
--
-- Read/written only by the service-role route /api/accounting/faire-payouts
-- (owner/admin). RLS on with no policies.

create table if not exists faire_payouts (
  payout_date     date primary key,
  qbo_entered_at  timestamptz,
  qbo_entered_by  uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);

comment on table faire_payouts is
  'Accounting → Faire Payouts: which payout days are entered in QBO. Service-role only; RLS on with no policies.';

alter table faire_payouts enable row level security;

-- The paid Faire orders behind the payouts, copied from the Faire API by the
-- hourly cron /api/cron/faire-payouts-sync (walking Faire live takes ~90s, too
-- slow for a page). One row per order; `payout` holds the computed breakdown
-- (lib/fairePayouts.ts FairePayoutOrder). Faire stays the source of truth —
-- rows are overwritten whenever Faire updates the order.
create table if not exists faire_payout_orders (
  display_id   text primary key,
  payout_date  date not null,
  paid_at      timestamptz not null,
  net          numeric(14, 2) not null,
  payout       jsonb not null,
  faire_updated_at timestamptz,
  synced_at    timestamptz not null default now()
);

create index if not exists faire_payout_orders_date_idx on faire_payout_orders (payout_date desc);

comment on table faire_payout_orders is
  'Paid Faire orders + their payout breakdown, synced hourly from the Faire API for Accounting → Faire Payouts. Service-role only.';

alter table faire_payout_orders enable row level security;
