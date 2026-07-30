-- Align holiday_prebook_requests with the schema the Sassy storefront's
-- /prebook action actually writes. The live FMG table was created from an
-- early shape (legacy display_qty / hand_creme_cases / hand_creme_units and NO
-- hc_* / totals / gift_sets_qty / hand_creme_display_qty), so store submissions
-- were failing with "Could not find the 'gift_sets_qty' column".
--
-- Mini hand crème AND gift sets are captured PER PERSONALITY (each scent its
-- own count); the _total columns and gift_sets_qty are stored for convenience.
-- Legacy columns are left in place, harmless. Mirrors
-- store/sassy/scripts/sql/holiday_prebook_requests.sql. Idempotent.

create table if not exists public.holiday_prebook_requests (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  store                    text not null default 'sassy',
  profile_id               uuid,
  business_name            text not null,
  contact_name             text not null,
  email                    text not null,
  phone                    text,
  notes                    text,
  status                   text not null default 'new'
    check (status in ('new', 'contacted', 'converted', 'archived'))
);

alter table public.holiday_prebook_requests
  add column if not exists hc_up_to_snow_good     integer not null default 0,
  add column if not exists hc_sleigh_all_day      integer not null default 0,
  add column if not exists hc_naughty_and_nice    integer not null default 0,
  add column if not exists hc_fa_la_la_fabulous   integer not null default 0,
  add column if not exists hc_holly_dazed         integer not null default 0,
  add column if not exists hc_ho_ho_glow          integer not null default 0,
  add column if not exists hand_creme_cases_total integer not null default 0,
  add column if not exists hand_creme_units_total integer not null default 0,
  add column if not exists gs_up_to_snow_good     integer not null default 0,
  add column if not exists gs_sleigh_all_day      integer not null default 0,
  add column if not exists gs_naughty_and_nice    integer not null default 0,
  add column if not exists gs_fa_la_la_fabulous   integer not null default 0,
  add column if not exists gs_holly_dazed         integer not null default 0,
  add column if not exists gs_ho_ho_glow          integer not null default 0,
  add column if not exists gift_sets_qty          integer not null default 0,
  add column if not exists lip_butter_qty         integer not null default 0,
  add column if not exists hand_creme_display_qty integer not null default 0,
  add column if not exists notes                  text,
  add column if not exists status                 text not null default 'new';

notify pgrst, 'reload schema';

create index if not exists holiday_prebook_requests_email_idx
  on public.holiday_prebook_requests (email);
create index if not exists holiday_prebook_requests_created_idx
  on public.holiday_prebook_requests (created_at desc);

alter table public.holiday_prebook_requests enable row level security;
