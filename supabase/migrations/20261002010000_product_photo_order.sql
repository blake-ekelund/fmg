-- Product photo order
--
-- Lets staff drag product photos into the order they want on the product
-- page's Media tab. Adds media_kit_assets.sort_order (NULL = not yet ordered;
-- those sort after ordered photos, by type) and rebuilds storefront_products
-- so each asset carries sort_order and the assets array comes back in that
-- order. The storefronts use it for gallery order, falling back to their
-- type-priority ordering for products nobody has reordered.
--
-- The view body is unchanged from 20260623000001 apart from the assets
-- aggregate (checked against the live view's columns on 2026-10-02).

alter table public.media_kit_assets
  add column if not exists sort_order integer;

comment on column public.media_kit_assets.sort_order is
  'Position of the photo within its product (0 = first), set by dragging on the product page. NULL = unordered.';

create index if not exists media_kit_assets_part_sort_idx
  on public.media_kit_assets (part, sort_order);

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
          'storage_path', a.storage_path,
          'sort_order', a.sort_order
        )
        order by a.sort_order nulls last, a.asset_type, a.storage_path
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
  'Public-readable projection of inventory_products + media_kit for the storefronts. Only rows where storefront_channel <> ''off'' are visible. on_hand is the latest inventory snapshot quantity per part (NULL = no snapshot yet); page_button_color drives the Buy button. assets are ordered by sort_order (drag order on the product page), unordered last.';

grant select on public.storefront_products to anon, authenticated;
