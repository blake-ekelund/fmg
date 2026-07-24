-- ════════════════════════════════════════════════════════════════════
-- Storefront consolidation — fold the storefront/"wholesale" project into
-- the FMG database.
--
-- Until now the storefronts (redek.io + naturalinspirations.com) kept their
-- accounts, carts, and orders in a SEPARATE Supabase project (ucjnpfth…),
-- while the catalog + discounts lived here in FMG (vxisjub…). That split is
-- what made discount-code validation read the wrong database and forced the
-- FMG portal to reach across projects for orders.
--
-- This migration recreates the storefront's account/commerce layer INSIDE the
-- FMG database so there is one database. No data is migrated (the old project
-- had no real activity); this is schema only.
--
-- ── The one hard collision ──────────────────────────────────────────
-- This database ALREADY has a `profiles` table — FMG's internal STAFF (access
-- roles: owner/sales/marketing/rep). The storefront's `profiles` are CUSTOMER
-- and wholesale-partner accounts — a completely different table that happens
-- to share the name. We must not touch staff `profiles`, so the storefront
-- accounts land as `storefront_profiles`. Everything customer-facing (orders,
-- addresses, perks) references THAT, never staff `profiles`.
--
-- Idempotent + additive on purpose: `orders` and `newsletter_signups` may
-- already exist here in an earlier/partial shape, so we create-if-absent and
-- add-column-if-absent rather than assuming a clean slate.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. storefront_profiles — customer + wholesale-partner accounts ───
-- Mirrors the old storefront `profiles` (sassy/supabase/schema.sql plus the
-- wholesale-project add-ons: instagram/business_phone split, sales_rep,
-- signup_store, and the two one-time perks). One row per auth user who is a
-- shopper/partner — NOT an internal FMG teammate.
create table if not exists public.storefront_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  business_phone text,
  website text,
  instagram text,
  tax_id text,
  business_type text,
  expected_monthly_volume text,
  role text not null default 'wholesale' check (role in ('wholesale','retail','admin')),
  wholesale_status text not null default 'pending'
    check (wholesale_status in ('pending','approved','denied')),
  -- FMG-internal rep assigned to this partner (first name; matches FMG roster).
  sales_rep text,
  -- Storefront the account was created on: 'sassy' | 'ni'. Null predates tracking.
  signup_store text,
  -- Two one-time 5% perks (math in the storefront's src/lib/perks.ts). {perk}_at
  -- marks when earned; {perk}_order records the SO that spent it (0 = mid-checkout).
  social_follow_perk_at timestamptz,
  social_follow_perk_order bigint,
  store_photo_perk_at timestamptz,
  store_photo_perk_order bigint,
  store_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.storefront_profiles is
  'Storefront customer / wholesale-partner accounts (redek.io + naturalinspirations.com). NOT internal FMG staff — those are public.profiles. One row per shopper/partner auth user.';

alter table public.storefront_profiles enable row level security;

-- A signed-in shopper sees and edits only their own row. Server actions that
-- act on behalf of the platform use the service role (which bypasses RLS).
drop policy if exists "storefront_profiles_self_read" on public.storefront_profiles;
create policy "storefront_profiles_self_read" on public.storefront_profiles
  for select using (auth.uid() = id);
drop policy if exists "storefront_profiles_self_insert" on public.storefront_profiles;
create policy "storefront_profiles_self_insert" on public.storefront_profiles
  for insert with check (auth.uid() = id);
drop policy if exists "storefront_profiles_self_update" on public.storefront_profiles;
create policy "storefront_profiles_self_update" on public.storefront_profiles
  for update using (auth.uid() = id);

-- updated_at trigger. `touch_updated_at` may already exist here (staff use it);
-- create-or-replace is a no-op in that case.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists storefront_profiles_touch on public.storefront_profiles;
create trigger storefront_profiles_touch before update on public.storefront_profiles
  for each row execute function public.touch_updated_at();

-- ── 2. addresses — ship-to / bill-to per storefront profile ─────────
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.storefront_profiles(id) on delete cascade,
  label text,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  is_default_shipping boolean not null default false,
  is_default_billing boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_profile_id_idx on public.addresses(profile_id);

alter table public.addresses enable row level security;
drop policy if exists "addresses_self_all" on public.addresses;
create policy "addresses_self_all" on public.addresses
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- ── 3. orders — storefront checkout (retail + wholesale) ────────────
-- May already exist here in the storefront shape. Create the base if absent,
-- then add every column the storefront server writes (the order→invoice
-- pipeline extended the original DDL), and repoint the buyer FK at
-- storefront_profiles (NOT staff profiles).
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001),
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('d2c', 'wholesale')),
  status text not null default 'new'
    check (status in ('new', 'processing', 'shipped', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded')),
  profile_id uuid,
  business_name text,
  contact_name text,
  email text,
  subtotal numeric not null default 0,
  shipping numeric not null default 0,
  total numeric not null default 0,
  items jsonb not null default '[]'::jsonb,
  note text
);

-- Columns the storefront writes beyond the original base DDL. Additive so an
-- already-extended table is left as-is.
alter table public.orders add column if not exists store text not null default 'sassy';
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists ship_to jsonb;
alter table public.orders add column if not exists bill_to jsonb;
alter table public.orders add column if not exists sales_rep text;
alter table public.orders add column if not exists payment_terms text;
alter table public.orders add column if not exists tax numeric not null default 0;
alter table public.orders add column if not exists discount numeric not null default 0;
alter table public.orders add column if not exists discounts jsonb;
alter table public.orders add column if not exists shipped_email_at timestamptz;
alter table public.orders add column if not exists recovery_emailed_at timestamptz;

create unique index if not exists orders_number_idx on public.orders (number);
create index if not exists orders_profile_idx on public.orders (profile_id, created_at desc);
create index if not exists orders_recovery_candidates_idx
  on public.orders (store, channel, payment_status, created_at)
  where recovery_emailed_at is null;

-- Repoint the buyer FK at storefront_profiles. Guarded: drop whatever
-- profile_id FK exists (it may point at staff profiles from the base DDL) and
-- add the correct one. Fails loudly if orders somehow holds rows whose
-- profile_id isn't a storefront profile — a safe stop, not silent corruption.
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.orders'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute
      where attrelid = 'public.orders'::regclass and attname = 'profile_id')];
  if c is not null then execute format('alter table public.orders drop constraint %I', c); end if;
  alter table public.orders
    add constraint orders_profile_id_fkey foreign key (profile_id)
    references public.storefront_profiles(id) on delete set null;
end $$;

comment on table public.orders is
  'Storefront orders (redek.io + naturalinspirations.com), retail + wholesale. Written by the storefront server at checkout; read by the FMG admin Purchases page. profile_id → storefront_profiles.';

alter table public.orders enable row level security;
drop policy if exists "partners read own orders" on public.orders;
create policy "partners read own orders" on public.orders
  for select using (auth.uid() = profile_id);

-- ── 4. newsletter_signups — add storefront columns if absent ────────
-- May pre-exist here in a simpler shape; only add what the storefront needs.
create table if not exists public.newsletter_signups (
  email text primary key,
  source text not null default 'site',
  created_at timestamptz not null default now()
);
alter table public.newsletter_signups
  add column if not exists brands text[] not null default '{sassy}';
alter table public.newsletter_signups
  add column if not exists unsubscribed_at timestamptz;
alter table public.newsletter_signups
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
alter table public.newsletter_signups
  add column if not exists welcomed_at timestamptz;
create index if not exists newsletter_signups_token_idx
  on public.newsletter_signups (unsubscribe_token);
alter table public.newsletter_signups enable row level security;

-- ── 5. contest_entries — shelfie contest + SHELFIE-xxxx reward codes ─
create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  instagram text,
  collection text not null,
  item text not null,
  photo_path text not null,
  likeness_consent boolean not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'featured', 'winner', 'rejected')),
  code text not null unique,
  code_redeemed_at timestamptz,
  order_number bigint
);
create index if not exists contest_entries_email_idx on public.contest_entries (email);
alter table public.contest_entries enable row level security;

-- ── 6. contact_messages — public contact-form submissions ───────────
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
-- Anon may submit; nobody but the service role may read (no SELECT policy).
drop policy if exists "contact_anon_insert" on public.contact_messages;
create policy "contact_anon_insert" on public.contact_messages
  for insert with check (true);

-- ── 7. analytics_events — first-party web activity ──────────────────
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  store text not null default 'sassy',
  visitor_id text not null,
  session_id text not null,
  event_type text not null check (event_type in ('pageview', 'engaged', 'click')),
  path text,
  referrer text,
  button_id text,
  label text,
  dwell_ms integer,
  device text,
  country text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  metadata jsonb
);
create index if not exists analytics_events_store_created_idx
  on public.analytics_events (store, created_at desc);
create index if not exists analytics_events_type_created_idx
  on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_visitor_idx
  on public.analytics_events (visitor_id);
alter table public.analytics_events enable row level security;

-- ── 8. rate_limits + rate_limit_hit() — shared fixed-window limiter ──
create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);
alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(
  p_key text,
  p_limit int,
  p_window_secs int
) returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
as $$
declare
  v_count int;
  v_start timestamptz;
begin
  insert into public.rate_limits as rl (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_secs)
            then 1 else rl.count + 1 end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_secs)
            then now() else rl.window_start end
  returning rl.count, rl.window_start into v_count, v_start;

  allowed   := v_count <= p_limit;
  remaining := greatest(0, p_limit - v_count);
  reset_at  := v_start + make_interval(secs => p_window_secs);
  return next;
end;
$$;

-- ── 9. private storage buckets (service-role access only) ───────────
insert into storage.buckets (id, name, public) values
  ('contest-photos', 'contest-photos', false),
  ('store-photos', 'store-photos', false)
on conflict (id) do nothing;
