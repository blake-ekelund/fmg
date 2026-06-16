-- Product page heading color
--
-- Splits the single page text color into two roles: page_text_color now
-- means BODY copy, and page_heading_color (new) tints headings (product
-- name + section headers) independently. Both are nullable #rrggbb. When
-- page_heading_color is null the storefronts fall back to page_text_color
-- (and then to their built-in palette), so existing single-color products
-- render exactly as before.

alter table public.inventory_products
  add column if not exists page_heading_color text
    check (page_heading_color is null or page_heading_color ~* '^#[0-9a-f]{6}$');

comment on column public.inventory_products.page_text_color is
  'Storefront product page BODY copy color (#rrggbb). Null = storefront default palette.';
comment on column public.inventory_products.page_heading_color is
  'Storefront product page HEADING color (#rrggbb). Null = falls back to page_text_color, then the storefront default palette.';

-- ── Rebuild the storefront view with the heading color column ───────────

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
