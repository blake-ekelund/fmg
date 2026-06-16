-- ════════════════════════════════════════════════════════════════════
-- Catch-up script — paste the WHOLE file into the Supabase dashboard SQL
-- editor and run once.
--
-- Adds page_heading_color (migration 20260615000000) and rebuilds the
-- storefront_products view to expose it. Self-contained: it re-adds every
-- column the final view depends on with IF NOT EXISTS, so it is safe to run
-- even if apply-pending-2026-06-12.sql has not been applied yet. It does
-- NOT recreate the storefront_discounts table or re-run the display_name
-- backfills — run apply-pending-2026-06-12.sql for those if needed.
--
-- Every statement is idempotent (IF NOT EXISTS / drop-then-create view), so
-- re-running it is harmless.
-- ════════════════════════════════════════════════════════════════════


-- ── Columns the final view depends on (idempotent) ──────────────────────

alter table public.inventory_products
  add column if not exists product_name text,
  add column if not exists product_form text,
  add column if not exists is_tester boolean not null default false,
  add column if not exists storefront_in_stock boolean not null default true,
  add column if not exists page_bg_color text
    check (page_bg_color is null or page_bg_color ~* '^#[0-9a-f]{6}$'),
  add column if not exists page_text_color text
    check (page_text_color is null or page_text_color ~* '^#[0-9a-f]{6}$'),
  add column if not exists page_heading_color text
    check (page_heading_color is null or page_heading_color ~* '^#[0-9a-f]{6}$'),
  add column if not exists page_accent_color text
    check (page_accent_color is null or page_accent_color ~* '^#[0-9a-f]{6}$');

alter table public.media_kit_products
  add column if not exists how_to_use text;

comment on column public.inventory_products.page_text_color is
  'Storefront product page BODY copy color (#rrggbb). Null = storefront default palette.';
comment on column public.inventory_products.page_heading_color is
  'Storefront product page HEADING color (#rrggbb). Null = falls back to page_text_color, then the storefront default palette.';


-- ── Final storefront_products view (adds page_heading_color) ────────────

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
  p.page_heading_color,
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


-- ── Sanity check — runs last so the editor shows a result row. ──────────

select
  count(*)                   as fg_products,
  count(page_heading_color)  as with_heading_color,
  (select count(*) from public.storefront_products) as published_to_storefronts
from public.inventory_products
where product_type = 'FG';
