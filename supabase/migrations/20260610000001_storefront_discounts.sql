-- Storefront discount codes
--
-- Managed from the FMG admin (Storefronts → Discounts) and consumed by the
-- redek.io / naturalinspirations.com checkouts once payment ships. Same
-- publish architecture as the catalog: FMG's database is the source of
-- truth, storefronts read through a hardened public view.

create table if not exists public.storefront_discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  brand text not null default 'both'
    check (brand in ('Sassy', 'NI', 'both')),
  kind text not null default 'percent'
    check (kind in ('percent', 'fixed')),
  value numeric not null check (value > 0),
  -- Optional gate: order subtotal must reach this before the code applies.
  min_subtotal numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  -- Internal note ("Q3 newsletter promo") — never shown to shoppers.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.storefront_discounts is
  'Discount codes for the Sassy/NI storefronts. Managed in FMG; storefronts read storefront_active_discounts.';

alter table public.storefront_discounts enable row level security;
-- No policies on purpose: only the service role (FMG admin API) touches the
-- table directly. Storefronts read the filtered view below.

-- Public read surface: active codes inside their date window only. Code
-- validation at checkout reads this with the anon key.
drop view if exists public.storefront_active_discounts;

create view public.storefront_active_discounts
with (security_invoker = off) as
select
  d.code,
  d.brand,
  d.kind,
  d.value,
  d.min_subtotal,
  d.starts_at,
  d.ends_at
from public.storefront_discounts d
where d.active
  and (d.starts_at is null or d.starts_at <= now())
  and (d.ends_at is null or d.ends_at >= now());

grant select on public.storefront_active_discounts to anon, authenticated;
