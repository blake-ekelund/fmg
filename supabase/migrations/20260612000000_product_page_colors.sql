-- Product page colors
--
-- Per-product page palette for the storefront product pages: background,
-- text, and accent. The storefronts currently hardcode palettes in their
-- repos (sassy: productPalettes by SKU; NI: collection themes). These
-- columns let FMG drive the page look per product — when set, they win
-- over the storefront's built-in palette; when null, the storefront
-- falls back to its existing collection/product theme.
--
-- Stored as lowercase #rrggbb hex. The admin UI and Excel import both
-- normalize before writing, the check constraint is the backstop.

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

-- ── Rebuild the storefront view with the color columns ──────────────────

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

grant select on public.storefront_products to anon, authenticated;
