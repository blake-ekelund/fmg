-- Point B inventory → storefront on_hand
--
-- Point B (Synapse) is the source of truth for stock, but the storefronts read
-- storefront_products with the anon key and can't call Synapse. So the
-- pointb-inventory-sync cron saves Point B's per-part count here every 15
-- minutes, and storefront_products.on_hand now prefers it over the Fishbowl
-- snapshot — the same Point B-first rule the Inventory page and Dashboard use
-- (lib/inventoryOnHand.ts).
--
-- on_hand per part =
--   Point B AVAILABLE (physical minus Suspense/QC Hold, stock committed to open
--   orders, and stock already picked for orders) when this table has a
--   comparable, fresh row for the part;
--   otherwise the latest Fishbowl snapshot's on_hand (unchanged behaviour).
--
-- "Comparable" = Point B counts the part in the same unit as Fishbowl (24 CS is
-- not 24 eaches). "Fresh" = synced in the last 6 hours, so a broken cron
-- degrades to Fishbowl instead of freezing the stores on an old Point B count.
--
-- Rows are never deleted: when a part vanishes from Synapse (sold through), the
-- cron zeroes it rather than dropping it — dropping it would fall back to
-- Fishbowl's stale count and show a sold-out product as in stock.
--
-- The view body is unchanged from 20261002010000 apart from on_hand.

create table if not exists public.pointb_inventory (
  part          text primary key,          -- upper(trim(part)), matched the same way below
  available     integer not null default 0,
  physical      integer not null default 0,
  held          integer not null default 0,
  committed     integer not null default 0,
  uom           text,                       -- Synapse unit(s), e.g. 'EA' or 'EA+CS'
  comparable    boolean not null default true,
  last_seen_at  timestamptz,                -- last sync the part was present in Synapse
  synced_at     timestamptz not null default now()
);

comment on table public.pointb_inventory is
  'Point B (Synapse) stock per part, saved by /api/cron/pointb-inventory-sync every 15 min. available = what storefront_products.on_hand uses. Parts that leave Synapse are zeroed, not deleted.';

-- Service role (the cron) only; the view reads it as its owner.
alter table public.pointb_inventory enable row level security;

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
  coalesce(
    (
      select pb.available
      from public.pointb_inventory pb
      where pb.part = upper(trim(p.part))
        and pb.comparable
        and pb.synced_at > now() - interval '6 hours'
    ),
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
    )
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
  'Public-readable projection of inventory_products + media_kit for the storefronts. Only rows where storefront_channel <> ''off'' are visible. on_hand = Point B available (pointb_inventory, when comparable and synced < 6h ago), else the latest Fishbowl snapshot quantity (NULL = neither); page_button_color drives the Buy button. assets are ordered by sort_order (drag order on the product page), unordered last.';

grant select on public.storefront_products to anon, authenticated;
