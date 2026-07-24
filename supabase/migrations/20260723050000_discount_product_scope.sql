-- Product-scoped discount codes: "50% off hand creme", "free travel candle".
--
-- Scope is expressed as matchers over fields the storefront catalog already
-- exposes on public.storefront_products, so checkout can judge a cart line
-- without extra lookups. Three levels, narrowing:
--
--   brands        → 'Sassy' | 'NI'
--   collections   → 'holiday', 'lavender-ylang', …
--   product_forms → 'Boxed Hand Creme', 'Body Butter', …
--
-- product_type is deliberately NOT a matcher: it is 'FG' on every product, so
-- it divides nothing.
--
-- Levels combine with AND, values within a level with OR:
--   {"brands":["Sassy"],"product_forms":["Body Butter","Diffuser"]}
--   = Sassy AND (Body Butter OR Diffuser).
--
-- ─────────────────────────────────────────────────────────────────────
-- SAFETY: this migration deliberately fails CLOSED.
--
-- Enforcement lives in the storefront checkout, a separate codebase. A
-- checkout that doesn't yet understand scope would read a scoped code, see
-- kind='percent' value=50, and take 50% off the WHOLE cart instead of the
-- hand creme — turning a targeted promo into an unbounded discount.
--
-- So the existing storefront_active_discounts view now EXCLUDES scoped codes.
-- An un-updated checkout simply doesn't find them and reports "invalid code",
-- which is recoverable. The new storefront_active_discounts_v2 view carries
-- the scope columns; a checkout opts in by reading that view instead, and only
-- once it can honour the rules.
-- ─────────────────────────────────────────────────────────────────────

alter table public.storefront_discounts
  -- 'all'     — applies to the whole order (every code today)
  -- 'include' — applies only to cart lines matching `scope`
  add column if not exists scope_kind text not null default 'all'
    check (scope_kind in ('all', 'include')),
  -- { "brands": [...], "collections": [...], "product_forms": [...],
  --   "parts": [...] }
  -- A line qualifies when it matches EVERY populated key, and within a key any
  -- one of the listed values. Empty/absent keys are ignored.
  add column if not exists scope jsonb not null default '{}'::jsonb,
  -- Cap on qualifying UNITS the discount touches, cheapest-first excluded:
  -- "one free hand creme" is scope_max_items = 1. NULL = every qualifying unit.
  add column if not exists scope_max_items integer
    check (scope_max_items is null or scope_max_items > 0);

-- 'free_item' = 100% off the qualifying units, bounded by scope_max_items.
-- Kept distinct from percent/100 so the storefront can label it "Free gift"
-- and so reporting can tell a giveaway from a discount.
alter table public.storefront_discounts
  drop constraint if exists storefront_discounts_kind_check;

alter table public.storefront_discounts
  add constraint storefront_discounts_kind_check
  check (kind in ('percent', 'fixed', 'free_item'));

comment on column public.storefront_discounts.scope is
  'Matchers over storefront_products (brands, collections, product_forms, parts). A line qualifies when it matches every populated key; within a key, any listed value. Levels AND, values OR.';

-- ── Legacy view: order-wide codes only ───────────────────────────────
-- Unchanged column list, so today's checkout keeps working byte for byte.
-- The added scope_kind filter is what keeps scoped codes away from it.
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
  and d.scope_kind = 'all'
  and d.kind <> 'free_item'
  and (d.starts_at is null or d.starts_at <= now())
  and (d.ends_at is null or d.ends_at >= now());

grant select on public.storefront_active_discounts to anon, authenticated;

-- ── v2: everything, including scope ──────────────────────────────────
-- For checkouts that can evaluate scope. Superset of the legacy view.
drop view if exists public.storefront_active_discounts_v2;

create view public.storefront_active_discounts_v2
with (security_invoker = off) as
select
  d.code,
  d.brand,
  d.kind,
  d.value,
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

comment on view public.storefront_active_discounts_v2 is
  'Active codes incl. product scope. Read this only from a checkout that applies scope_kind/scope/scope_max_items; storefront_active_discounts is the order-wide-only subset for older clients.';
