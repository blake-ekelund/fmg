-- Discount usage limits: per-customer caps + unique single-use code batches.
--
-- Extends storefront_discounts (see 20260610000001). FMG remains the source of
-- truth; storefronts read through hardened public views. Enforcement lives in
-- the storefront checkout — these columns/tables define the rules it applies.

-- 1) Per-customer redemption cap on a shared code.
--    NULL = unlimited; 1 = once per customer (matched by email at checkout).
alter table public.storefront_discounts
  add column if not exists per_customer_limit int
    check (per_customer_limit is null or per_customer_limit > 0);

-- 2) Mark a discount as a batch of unique, single-use codes. When true, the
--    shared `code` is just the batch name — shoppers redeem a generated code
--    from storefront_discount_codes instead.
alter table public.storefront_discounts
  add column if not exists unique_codes boolean not null default false;

comment on column public.storefront_discounts.per_customer_limit is
  'Max redemptions per shopper (matched by email at checkout). NULL = unlimited.';
comment on column public.storefront_discounts.unique_codes is
  'When true, shoppers redeem a one-time code from storefront_discount_codes; the row''s own code is the batch name.';

-- 3) The generated one-time codes for a unique-code discount.
create table if not exists public.storefront_discount_codes (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null
    references public.storefront_discounts(id) on delete cascade,
  code text not null unique,
  -- Stamped when the storefront checkout consumes the code (single use).
  redeemed_at timestamptz,
  order_id text,
  created_at timestamptz not null default now()
);

create index if not exists storefront_discount_codes_discount_idx
  on public.storefront_discount_codes(discount_id);

comment on table public.storefront_discount_codes is
  'One-time codes belonging to a unique-code storefront_discounts row. Managed in FMG; storefronts validate via storefront_active_unique_codes.';

alter table public.storefront_discount_codes enable row level security;
-- No policies: only the service role (FMG admin API) writes; the storefront
-- validates redemptions through the filtered view below.

-- 4) Public read surface for shared codes — now exposes per_customer_limit and
--    hides unique-code parents (those are redeemed via their child codes).
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
  d.ends_at,
  d.per_customer_limit
from public.storefront_discounts d
where d.active
  and not d.unique_codes
  and (d.starts_at is null or d.starts_at <= now())
  and (d.ends_at is null or d.ends_at >= now());

grant select on public.storefront_active_discounts to anon, authenticated;

-- 5) Public read surface for unique codes: an unredeemed code whose parent
--    discount is active + in window. Checkout validates an entered code here,
--    then stamps redeemed_at via the service role.
drop view if exists public.storefront_active_unique_codes;

create view public.storefront_active_unique_codes
with (security_invoker = off) as
select
  c.code,
  d.brand,
  d.kind,
  d.value,
  d.min_subtotal,
  d.per_customer_limit
from public.storefront_discount_codes c
join public.storefront_discounts d on d.id = c.discount_id
where c.redeemed_at is null
  and d.active
  and (d.starts_at is null or d.starts_at <= now())
  and (d.ends_at is null or d.ends_at >= now());

grant select on public.storefront_active_unique_codes to anon, authenticated;
