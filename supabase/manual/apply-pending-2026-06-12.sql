-- ════════════════════════════════════════════════════════════════════
-- Consolidated catch-up script — paste the WHOLE file into the Supabase
-- dashboard SQL editor and run once.
--
-- The live database is applied through 20260528000002. This script
-- applies the three pending migrations in dependency order:
--   1. 20260610000000_structured_product_fields  (product_name, etc.)
--   2. 20260610000001_storefront_discounts
--   3. 20260612000000_product_page_colors
--
-- Every statement is idempotent (IF NOT EXISTS / guarded backfills /
-- drop-then-create views), so re-running it is harmless. The
-- intermediate storefront_products rebuild from the June 10 migration
-- is skipped — the final view below is a superset of it.
--
-- This file lives OUTSIDE supabase/migrations on purpose so the CLI
-- never treats it as a migration. If you later switch to
-- `supabase db push`, it will re-run the three real migration files;
-- they are idempotent and end in the same final view, so that's safe.
-- ════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────
-- 1. 20260610000000 — structured product naming + storefront fields
-- ──────────────────────────────────────────────────────────────────

alter table public.inventory_products
  add column if not exists product_name text,
  add column if not exists product_form text,
  add column if not exists is_tester boolean not null default false,
  add column if not exists storefront_in_stock boolean not null default true;

comment on column public.inventory_products.product_name is
  'Brand product/personality name ("Bougie Babe"). Sassy only; NI leaves null.';
comment on column public.inventory_products.product_form is
  'Product format ("Mini Hand Crème", "SPF 30 Lip Butter", "Body Butter").';
comment on column public.inventory_products.is_tester is
  'Retailer tester unit (NI). Composes display_name as "TESTER {form}".';
comment on column public.inventory_products.storefront_in_stock is
  'Manual storefront availability flag. False = storefronts may show out-of-stock state.';

alter table public.media_kit_products
  add column if not exists how_to_use text;

comment on column public.media_kit_products.how_to_use is
  'Application/usage directions shown on storefront product pages.';

-- Backfill from existing display_name conventions.
-- Sassy: "{Name} – {Form}" with any dash run (-, --, –, —) surrounded by
-- spaces. Rows without a separator get the whole display_name as the form.
update public.inventory_products
set
  product_name = nullif(btrim((regexp_match(display_name, '^(.*?)\s+[-–—]+\s+(.*)$'))[1]), ''),
  product_form = coalesce(
    nullif(btrim((regexp_match(display_name, '^(.*?)\s+[-–—]+\s+(.*)$'))[2]), ''),
    nullif(btrim(display_name), '')
  )
where brand = 'Sassy'
  and product_name is null
  and product_form is null
  and display_name is not null;

-- NI: "TESTER {Form}" / "{Form}". No personality name.
update public.inventory_products
set
  is_tester = display_name ~* '^tester\s',
  product_form = nullif(btrim(regexp_replace(display_name, '^tester\s+', '', 'i')), '')
where brand = 'NI'
  and product_form is null
  and display_name is not null;


-- ──────────────────────────────────────────────────────────────────
-- 2. 20260610000001 — storefront discount codes
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.storefront_discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  brand text not null default 'both'
    check (brand in ('Sassy', 'NI', 'both')),
  kind text not null default 'percent'
    check (kind in ('percent', 'fixed')),
  value numeric not null check (value > 0),
  min_subtotal numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.storefront_discounts is
  'Discount codes for the Sassy/NI storefronts. Managed in FMG; storefronts read storefront_active_discounts.';

alter table public.storefront_discounts enable row level security;
-- No policies on purpose: only the service role (FMG admin API) touches the
-- table directly. Storefronts read the filtered view below.

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


-- ──────────────────────────────────────────────────────────────────
-- 3. 20260612000000 — product page colors
-- ──────────────────────────────────────────────────────────────────

alter table public.inventory_products
  add column if not exists page_bg_color text
    check (page_bg_color is null or page_bg_color ~* '^#[0-9a-f]{6}$'),
  add column if not exists page_text_color text
    check (page_text_color is null or page_text_color ~* '^#[0-9a-f]{6}$'),
  add column if not exists page_accent_color text
    check (page_accent_color is null or page_accent_color ~* '^#[0-9a-f]{6}$');

comment on column public.inventory_products.page_bg_color is
  'Storefront product page background color (#rrggbb). Null = storefront default palette.';
comment on column public.inventory_products.page_text_color is
  'Storefront product page text/ink color (#rrggbb). Null = storefront default palette.';
comment on column public.inventory_products.page_accent_color is
  'Storefront product page accent color (CTAs, highlights) (#rrggbb). Null = storefront default palette.';


-- ──────────────────────────────────────────────────────────────────
-- Final storefront_products view — supersedes every earlier version.
-- Adds: product_name, product_form, is_tester, in_stock, upc,
--       how_to_use, metafields, page colors.
-- Drops: retailer_notes (internal-only; was publicly readable).
-- ──────────────────────────────────────────────────────────────────

drop view if exists public.storefront_products;

create view public.storefront_products
with (security_invoker = off) as
select
  p.part,
  p.display_name,
  p.product_name,
  p.product_form,
  p.is_tester,
  p.fragrance,
  p.size,
  p.brand,
  p.product_type,
  p.collection,
  p.storefront_channel,
  p.storefront_in_stock as in_stock,
  p.msrp,
  p.wholesale_price,
  p.compare_at_price,
  p.case_pack,
  p.moq,
  p.subtitle,
  p.infused_with,
  p.barcode as upc,
  p.category_path,
  p.country_of_origin,
  p.metafields,
  p.page_bg_color,
  p.page_text_color,
  p.page_accent_color,
  m.short_description,
  m.long_description,
  m.benefits,
  m.ingredients_text,
  m.how_to_use,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'asset_type', a.asset_type,
          'storage_path', a.storage_path
        )
        order by a.asset_type
      )
      from public.media_kit_assets a
      where a.part = p.part
    ),
    '[]'::jsonb
  ) as assets
from public.inventory_products p
left join public.media_kit_products m on m.part = p.part
where p.storefront_channel <> 'off'
  and p.product_type = 'FG';

comment on view public.storefront_products is
  'Public-readable projection of inventory_products + media_kit for the storefronts. Only rows where storefront_channel <> ''off'' are visible.';

grant select on public.storefront_products to anon, authenticated;


-- ──────────────────────────────────────────────────────────────────
-- Sanity check — runs last so the editor shows a result row.
-- ──────────────────────────────────────────────────────────────────

select
  count(*)                  as fg_products,
  count(product_form)       as with_structured_form,
  count(page_bg_color)      as with_page_colors,
  (select count(*) from public.storefront_products) as published_to_storefronts
from public.inventory_products
where product_type = 'FG';
