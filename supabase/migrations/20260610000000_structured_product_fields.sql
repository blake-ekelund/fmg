-- Structured product naming + storefront editor fields
--
-- Problem: display_name has been a hand-typed string that BOTH storefronts
-- parse with invisible brand conventions (Sassy: "{Name} – {Form}" split on
-- a dash; NI: "{Form}" with an optional "TESTER " prefix). Real data already
-- drifted ("--" separators, creme/crème, em vs en dash). This migration makes
-- the parts first-class columns; the admin form now composes display_name
-- from them, so legacy consumers keep working while the conventions stop
-- living in editors' heads.
--
-- Also: exposes barcode to the storefronts as `upc`, adds how-to-use copy,
-- adds a manual storefront stock flag, and stops leaking retailer_notes
-- (internal merchandising notes) through the public anon-readable view.

-- ── inventory_products: structured name parts + stock flag ──────────────

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

-- ── media_kit_products: how-to-use copy ─────────────────────────────────

alter table public.media_kit_products
  add column if not exists how_to_use text;

comment on column public.media_kit_products.how_to_use is
  'Application/usage directions shown on storefront product pages.';

-- ── Backfill from existing display_name conventions ─────────────────────

-- Sassy: "{Name} – {Form}" with any dash run (-, --, –, —) surrounded by
-- spaces. Rows without a separator (e.g. "Sassy Mini Hand Creme" or the
-- mixed prepack) get the whole display_name as the form, no name.
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

-- ── Rebuild the storefront view ──────────────────────────────────────────
--
-- Adds: product_name, product_form, is_tester, in_stock, upc (alias of
--       barcode), how_to_use.
-- Drops: retailer_notes (internal-only; was publicly readable via anon).

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
