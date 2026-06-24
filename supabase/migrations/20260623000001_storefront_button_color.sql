-- Storefront Buy-button color
--
-- Adds a per-product page_button_color that drives the main Buy button on the
-- Sassy storefront product page, independent of the general accent color. NULL
-- = the storefronts fall back to the accent color (current behavior). Rebuilds
-- storefront_products to expose it alongside on_hand (added just prior).

alter table public.inventory_products
  add column if not exists page_button_color text
    check (page_button_color is null or page_button_color ~* '^#[0-9a-f]{6}$');

comment on column public.inventory_products.page_button_color is
  'Storefront product page Buy-button color (#rrggbb). Null = falls back to the accent color.';

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
  (
    select i.on_hand
    from public.inventory_snapshot_items i
    where i.part = p.part
      and i.upload_id = (
        select u.id
        from public.inventory_uploads u
        order by u.created_at desc
        limit 1
      )
    limit 1
  ) as on_hand,
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
  p.page_button_color,
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
  'Public-readable projection of inventory_products + media_kit for the storefronts. Only rows where storefront_channel <> ''off'' are visible. on_hand is the latest inventory snapshot quantity per part (NULL = no snapshot yet); page_button_color drives the Buy button.';

grant select on public.storefront_products to anon, authenticated;
