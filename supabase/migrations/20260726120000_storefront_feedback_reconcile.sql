-- Reconcile an older storefront_feedback table with the shape the FMG feedback
-- API actually writes.
--
-- 20260723060000_storefront_feedback.sql used CREATE TABLE IF NOT EXISTS. Where
-- a differently-shaped `storefront_feedback` already existed (prod had an older
-- rating/headline/body design), that CREATE silently no-op'd — so the API's
-- INSERT hit columns that don't exist and omitted the NOT NULL `body`, throwing
-- a 500 on every submission. This migration is additive + idempotent: it adds
-- the columns the API writes and relaxes the legacy `body` constraint. No data
-- is dropped.

-- Columns the API writes (ux_rating / personality / issues / recommendations).
alter table public.storefront_feedback
  add column if not exists ux_rating int,
  add column if not exists personality_tags text[] not null default '{}',
  add column if not exists personality text,
  add column if not exists had_issues boolean,
  add column if not exists issues text,
  add column if not exists recommendations text;

-- Legacy columns the API never writes. `body` was NOT NULL with no default,
-- which alone would fail every insert — relax it. (Kept, not dropped, so any
-- existing rows are untouched.)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'storefront_feedback'
      and column_name = 'body' and is_nullable = 'NO'
  ) then
    alter table public.storefront_feedback alter column body drop not null;
  end if;
end $$;

-- 1–5 guard for the rating the API writes (matches the canonical migration).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'storefront_feedback_ux_rating_check'
  ) then
    alter table public.storefront_feedback
      add constraint storefront_feedback_ux_rating_check
      check (ux_rating is null or (ux_rating between 1 and 5));
  end if;
end $$;
