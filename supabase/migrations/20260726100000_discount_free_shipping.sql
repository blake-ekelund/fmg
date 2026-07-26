-- ════════════════════════════════════════════════════════════════════
-- Free shipping for storefront discount codes.
--
-- Two shapes, per the admin:
--   1. Add-on   — any percent/fixed/free_item code can ALSO waive shipping
--                 (free_shipping = true).
--   2. Only     — a code whose sole effect is free shipping
--                 (kind = 'free_shipping', value = 0, free_shipping = true).
--
-- The storefront cart zeroes its "Shipping" line for the code's brand when
-- free_shipping is set. (That cart wiring lives in the store repos — this
-- migration only makes the flag configurable + readable, mirroring how scoped
-- codes shipped ahead of their checkout support.)
--
-- Extends storefront_discounts (see 20260610000001 / 20260623000000 /
-- 20260723050000). Additive + idempotent.
-- ════════════════════════════════════════════════════════════════════

alter table public.storefront_discounts
  add column if not exists free_shipping boolean not null default false;

comment on column public.storefront_discounts.free_shipping is
  'When true, the code waives shipping (sets the storefront Shipping line to $0) for its brand. May ride along with a percent/fixed/free_item discount, or stand alone as kind=''free_shipping''.';

-- Allow the new stand-alone kind.
alter table public.storefront_discounts
  drop constraint if exists storefront_discounts_kind_check;
alter table public.storefront_discounts
  add constraint storefront_discounts_kind_check
  check (kind in ('percent', 'fixed', 'free_item', 'free_shipping'));

-- A free-shipping-only code carries no product discount, so relax the positive
-- value guard for that kind (it stores value = 0). Every other kind still > 0.
alter table public.storefront_discounts
  drop constraint if exists storefront_discounts_value_check;
alter table public.storefront_discounts
  add constraint storefront_discounts_value_check
  check (value > 0 or kind = 'free_shipping');

-- ── Legacy view: order-wide, single-effect codes ─────────────────────
-- Adds free_shipping so a v1 checkout can honor the add-on flag, but keeps
-- free-shipping-ONLY codes out (like free_item): a v1 reader computes off
-- `value`, and a value-0 code would otherwise look like a $0-off no-op.
drop view if exists public.storefront_active_discounts;

create view public.storefront_active_discounts
with (security_invoker = off) as
select
  d.code,
  d.brand,
  d.kind,
  d.value,
  d.free_shipping,
  d.min_subtotal,
  d.starts_at,
  d.ends_at
from public.storefront_discounts d
where d.active
  and d.scope_kind = 'all'
  and d.kind not in ('free_item', 'free_shipping')
  and (d.starts_at is null or d.starts_at <= now())
  and (d.ends_at is null or d.ends_at >= now());

grant select on public.storefront_active_discounts to anon, authenticated;

-- ── v2: everything, including scope + free shipping ──────────────────
drop view if exists public.storefront_active_discounts_v2;

create view public.storefront_active_discounts_v2
with (security_invoker = off) as
select
  d.code,
  d.brand,
  d.kind,
  d.value,
  d.free_shipping,
  d.min_subtotal,
  d.starts_at,
  d.ends_at,
  d.scope_kind,
  d.scope,
  d.scope_max_items
from public.storefront_discounts d
where d.active
  and (d.starts_at is null or d.starts_at <= now())
  and (d.ends_at is null or d.ends_at >= now());

grant select on public.storefront_active_discounts_v2 to anon, authenticated;
