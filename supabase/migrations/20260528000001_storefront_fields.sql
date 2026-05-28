-- Storefront fields extension
--
-- Adds the Shopify-style product metadata that drives the storefront's
-- product detail experience (subtitle, infused-with, category, etc.) plus
-- a flexible jsonb `metafields` column for everything else.

-- ------------------------------------------------------------------
-- 1. Extend inventory_products
-- ------------------------------------------------------------------
alter table public.inventory_products
  add column if not exists subtitle text,
  add column if not exists infused_with text,
  add column if not exists barcode text,
  add column if not exists compare_at_price numeric,
  add column if not exists category_path text,
  add column if not exists weight_oz numeric,
  add column if not exists country_of_origin text,
  add column if not exists hs_code text,
  add column if not exists metafields jsonb not null default '{}'::jsonb;

comment on column public.inventory_products.subtitle is
  'Marketing subtitle shown under the product name (e.g. "Sassy + Co Everyday Collection").';
comment on column public.inventory_products.infused_with is
  'Free-form "infused with" tagline (e.g. "GLAM + LUXE ELEGANCE").';
comment on column public.inventory_products.barcode is 'UPC / EAN / GTIN barcode.';
comment on column public.inventory_products.compare_at_price is
  'Strikethrough comparison price; shown when > price.';
comment on column public.inventory_products.category_path is
  'Display category path (e.g. "Lotions & Moisturizers in Skin Care").';
comment on column public.inventory_products.metafields is
  'Flexible key/value bag for category metafields (scent, fragrance level, SPF, target gender, etc.). Storefront reads selectively.';

-- ------------------------------------------------------------------
-- 2. Rebuild storefront_products view with the new columns
-- ------------------------------------------------------------------
drop view if exists public.storefront_products;

create view public.storefront_products
with (security_invoker = off) as
select
  p.part,
  p.display_name,
  p.fragrance,
  p.size,
  p.brand,
  p.product_type,
  p.storefront_channel,
  p.msrp,
  p.wholesale_price,
  p.compare_at_price,
  p.case_pack,
  p.moq,
  p.subtitle,
  p.infused_with,
  p.category_path,
  p.country_of_origin,
  p.metafields,
  m.short_description,
  m.long_description,
  m.benefits,
  m.ingredients_text,
  m.retailer_notes,
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
  'Public-readable projection of inventory_products + media_kit for redek.io. Only rows where storefront_channel <> ''off'' are visible.';

grant select on public.storefront_products to anon, authenticated;
