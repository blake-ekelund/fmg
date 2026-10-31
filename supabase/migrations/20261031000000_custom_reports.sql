-- Custom reports (the Reports page): saved dashboards of KPI tiles, tables,
-- pivot tables and charts, built mostly by Sage, optionally emailed on a
-- schedule (daily / weekdays / weekly / monthly at a Central-time hour).
--
-- `widgets` is the report definition (lib/reports/types.ts): each widget holds
-- a query over Sage's data catalog, which is re-run on every view under the
-- VIEWER's role — so a shared report never shows someone data their role can't
-- open. Scheduled emails run under the report OWNER's role and only go to
-- internal staff addresses.
--
-- The cron (/api/cron/reports, every 15 min) picks rows whose next_run_at has
-- passed and claims each by moving next_run_at forward with a compare-and-set,
-- so overlapping runs never double-send.
--
-- Written/read only by service-role API routes. RLS on with no policies.

create table if not exists custom_reports (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  title            text not null default 'Untitled report',
  description      text,
  widgets          jsonb not null default '[]'::jsonb,
  -- { frequency: daily|weekdays|weekly|monthly, time: 'HH:MM' (Central),
  --   weekday 0-6, monthday 1-28 | 'last', recipients: text[], attach_excel }
  schedule         jsonb,
  schedule_enabled boolean not null default false,
  next_run_at      timestamptz,
  last_run_at      timestamptz,
  last_run_status  text,          -- sent | failed
  last_run_error   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists custom_reports_due_idx
  on custom_reports (next_run_at)
  where schedule_enabled;

create index if not exists custom_reports_updated_idx
  on custom_reports (updated_at desc);

comment on table custom_reports is
  'Saved custom reports (Reports page) + email schedules. Service-role API only; RLS on with no policies.';

alter table custom_reports enable row level security;
