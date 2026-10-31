-- Team rules for custom reports: plain-English rules staff add on the Reports
-- page (or by telling Sage, e.g. "always split sales by brand") that Sage
-- follows whenever it builds, changes or recommends report widgets. They sit on
-- top of the built-in house rules in lib/reports/rules.ts.
--
-- Shared by the whole team. Written/read only by service-role API routes
-- (/api/reports/rules, the Sage agent). RLS on with no policies.

create table if not exists report_rules (
  id          uuid primary key default gen_random_uuid(),
  rule        text not null check (char_length(rule) between 3 and 400),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists report_rules_created_idx on report_rules (created_at);

comment on table report_rules is
  'Team rules Sage follows when building reports (Reports page). Service-role API only; RLS on with no policies.';

alter table report_rules enable row level security;
