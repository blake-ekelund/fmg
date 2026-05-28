-- Collection field
--
-- First-class column for which storefront collection a product belongs to.
-- For Sassy: everyday / love / holiday.
-- For NI: per-fragrance lines (agave-pear, coconut-ambre-vanille, etc.) —
-- left null on existing rows for the founder to fill in.

alter table public.inventory_products
  add column if not exists collection text;

comment on column public.inventory_products.collection is
  'Storefront collection slug. Sassy: everyday | love | holiday. NI: per fragrance line.';

-- Backfill Sassy collections from SKU prefix
update public.inventory_products
   set collection = case
     when substr(part, 1, 3) in ('123', '223', '410') then 'everyday'
     when substr(part, 1, 3) = '125' then 'love'
     when substr(part, 1, 3) in ('124', '224') then 'holiday'
     else collection
   end
 where brand = 'Sassy' and collection is null;

-- Rebuild storefront_products view to expose the collection column
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
  p.collection,
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

grant select on public.storefront_products to anon, authenticated;
