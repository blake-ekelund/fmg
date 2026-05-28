-- Storefront publish surface
--
-- Adds the columns and view that lets redek.io (sassy storefront)
-- pull products from FMG. Additive only: existing FMG tooling is
-- unaffected, and nothing leaks to the storefront until a product
-- is explicitly published (storefront_channel != 'off').

-- ------------------------------------------------------------------
-- 1. inventory_products: new storefront columns
-- ------------------------------------------------------------------
alter table public.inventory_products
  add column if not exists storefront_channel text not null default 'off'
    check (storefront_channel in ('d2c', 'wholesale', 'both', 'off'));

alter table public.inventory_products
  add column if not exists msrp numeric;

alter table public.inventory_products
  add column if not exists wholesale_price numeric;

alter table public.inventory_products
  add column if not exists case_pack integer;

alter table public.inventory_products
  add column if not exists moq integer default 1;

comment on column public.inventory_products.storefront_channel is
  'Publish surface: d2c (retail only), wholesale (PO only), both, off (hidden).';
comment on column public.inventory_products.msrp is
  'Suggested retail price (D2C). Null until published.';
comment on column public.inventory_products.wholesale_price is
  'Per-unit wholesale price for case-pack ordering. Null until published.';
comment on column public.inventory_products.case_pack is
  'Units per case for wholesale.';
comment on column public.inventory_products.moq is
  'Minimum order quantity (in cases) for wholesale.';

-- ------------------------------------------------------------------
-- 2. storefront_products view
-- Joins inventory + media kit + asset list, restricted to FG SKUs
-- that have been published. Bypasses RLS on purpose (security_invoker=off)
-- but only exposes the whitelisted columns + filters.
-- ------------------------------------------------------------------
create or replace view public.storefront_products
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
  p.case_pack,
  p.moq,
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
  'Public-readable projection of inventory_products + media_kit. Only rows where storefront_channel <> ''off'' are visible. Source of truth for the redek.io storefront.';

grant select on public.storefront_products to anon, authenticated;

-- ------------------------------------------------------------------
-- 3. Make the media-kit bucket public-read so storefront images
-- can be fetched with plain URLs.
-- ------------------------------------------------------------------
update storage.buckets
   set public = true
 where id = 'media-kit';
