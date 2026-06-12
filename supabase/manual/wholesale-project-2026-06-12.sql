-- ════════════════════════════════════════════════════════════════════
-- Wholesale project catch-up — sales rep column + orders table
--
-- ⚠ Run this on the WHOLESALE Supabase project (the one behind
-- WHOLESALE_SUPABASE_URL — partner auth/profiles for redek.io +
-- naturalinspirations.com), NOT the FMG product database.
--
-- Paste the whole file into that project's SQL editor and run once.
-- Idempotent. Supersedes wholesale-project-sales-rep.sql.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Sales rep assignment (FMG admin Partners page) ───────────────

alter table public.profiles
  add column if not exists sales_rep text;

comment on column public.profiles.sales_rep is
  'FMG-internal sales rep assigned to this partner (first name, matches FMG team roster). Managed from the FMG admin Partners page.';

-- ── 1b. Which storefront the partner signed up from ─────────────────

alter table public.profiles
  add column if not exists signup_store text;

comment on column public.profiles.signup_store is
  'Storefront the account was created on: ''sassy'' (redek.io) or ''ni'' (naturalinspirations.com). Null for accounts that predate tracking.';

-- ── 2. Orders (storefront checkout — currently test mode, no payment) ─

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Human-friendly order number: SO-1001, SO-1002, …
  number bigint generated always as identity (start with 1001),
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('d2c', 'wholesale')),
  status text not null default 'new'
    check (status in ('new', 'processing', 'shipped', 'cancelled')),
  -- 'unpaid' = placed without payment (test mode / terms TBD).
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded')),
  -- Null for guest d2c checkouts.
  profile_id uuid references public.profiles (id) on delete set null,
  -- Buyer snapshot at order time (profiles can change later).
  business_name text,
  contact_name text,
  email text,
  subtotal numeric not null,
  shipping numeric not null default 0,
  total numeric not null,
  -- [{ part, name, form, price, quantity }, …]
  items jsonb not null,
  note text
);

create unique index if not exists orders_number_idx on public.orders (number);
create index if not exists orders_profile_idx on public.orders (profile_id, created_at desc);

comment on table public.orders is
  'Storefront orders (redek.io + naturalinspirations.com), retail and wholesale. Written by the storefront server at checkout; read by the FMG admin Purchases page.';

alter table public.orders enable row level security;

-- Partners can read their own orders (powers the reorder page);
-- inserts/updates go through the service role only.
drop policy if exists "partners read own orders" on public.orders;
create policy "partners read own orders" on public.orders
  for select using (auth.uid() = profile_id);

-- ── Sanity check ─────────────────────────────────────────────────────

select
  (select count(*) from information_schema.columns
    where table_name = 'profiles' and column_name = 'sales_rep') as has_sales_rep,
  (select count(*) from information_schema.tables
    where table_name = 'orders' and table_schema = 'public') as has_orders;
