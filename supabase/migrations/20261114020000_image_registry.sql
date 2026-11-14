-- One image, many places (Nov 2026).
--
-- Product photos (`media_kit_assets` → public `media-kit` bucket) and the
-- Image Library (`email-assets` bucket) were two separate piles: the same
-- fragrance shot was uploaded to 9–16 products (385 byte-identical copies,
-- 555 MB), originals went up at 1–5 MB, and almost nothing had alt text.
--
-- 1. `email_asset_meta` becomes the image REGISTRY for both buckets. It is
--    already keyed by path ("<path>" for email-assets, "media-kit:<path>" for
--    product photos); it now also records a content fingerprint and size so an
--    upload of a file we already have reuses it instead of storing a copy.
--      sha256      — hex SHA-256 of the bytes as UPLOADED (before optimizing),
--                    so re-uploading the same original is recognised.
--      bytes/width/height — the stored (optimized) file.
--      ai_described_at    — when Sage last drafted title/alt/description.
-- 2. Product rows that share one stored file are fine: media_kit_assets is
--    the "this photo is on this product" link. Removing a photo from a product
--    deletes the link; the file is only deleted when nothing links to it.
-- 3. Fragrance photos are attached to a fragrance once (`fragrance_images`)
--    and automatically linked to every product with that fragrance, as
--    media_kit_assets rows with `shared_from` = the fragrance_images id (so
--    the storefronts need no change). Hiding one on a single product records
--    a `fragrance_image_exclusions` row so the sync won't re-add it.
-- 4. Replaced files aren't deleted straight away — old emails / links may
--    still point at them. `image_delete_queue` holds them for 30 days; the
--    image-cleanup cron removes them after that.
-- 5. storefront_products assets now carry alt_text + title so the storefronts
--    can use real alt text (SEO / AI search) instead of "<name> — front".

alter table public.email_asset_meta
  add column if not exists sha256 text,
  add column if not exists bytes integer,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists ai_described_at timestamptz;

create index if not exists email_asset_meta_sha256_idx
  on public.email_asset_meta (sha256) where sha256 is not null;

create table if not exists public.fragrance_images (
  id            uuid primary key default gen_random_uuid(),
  brand         text not null,
  -- The fragrance as products store it (inventory_products.fragrance is a
  -- comma-joined list; matching is case-insensitive per entry).
  fragrance     text not null,
  storage_path  text not null,             -- in the media-kit bucket
  asset_type    text not null default 'fragrance',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (brand, fragrance, storage_path)
);

alter table public.media_kit_assets
  add column if not exists shared_from uuid references public.fragrance_images(id) on delete cascade;

create index if not exists media_kit_assets_shared_from_idx
  on public.media_kit_assets (shared_from) where shared_from is not null;
create index if not exists media_kit_assets_storage_path_idx
  on public.media_kit_assets (storage_path);

create table if not exists public.fragrance_image_exclusions (
  part               text not null,
  fragrance_image_id uuid not null references public.fragrance_images(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (part, fragrance_image_id)
);

create table if not exists public.image_delete_queue (
  bucket        text not null,
  path          text not null,
  delete_after  timestamptz not null default now() + interval '30 days',
  reason        text,
  replaced_by   text,
  created_at    timestamptz not null default now(),
  primary key (bucket, path)
);

-- Server-only tables (service role bypasses RLS); signed-in staff may read.
alter table public.fragrance_images enable row level security;
alter table public.fragrance_image_exclusions enable row level security;
alter table public.image_delete_queue enable row level security;

drop policy if exists "fragrance_images read" on public.fragrance_images;
create policy "fragrance_images read" on public.fragrance_images
  for select to authenticated using (true);
drop policy if exists "fragrance_image_exclusions read" on public.fragrance_image_exclusions;
create policy "fragrance_image_exclusions read" on public.fragrance_image_exclusions
  for select to authenticated using (true);

-- storefront_products: identical to 20261026000000 except each asset also
-- carries alt_text + title from the registry.
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
          'sort_order', a.sort_order,
          'alt_text', em.alt_text,
          'title', em.title
        )
        order by a.sort_order nulls last, a.asset_type, a.storage_path
      )
      from public.media_kit_assets a
      left join public.email_asset_meta em on em.path = 'media-kit:' || a.storage_path
      where a.part = p.part
    ),
    '[]'::jsonb
  ) as assets
from public.inventory_products p
left join public.media_kit_products m on m.part = p.part
where p.storefront_channel <> 'off'
  and p.product_type = 'FG';

comment on view public.storefront_products is
  'Public-readable projection of inventory_products + media_kit for the storefronts. Only rows where storefront_channel <> ''off'' are visible. on_hand = Point B available (pointb_inventory, when comparable and synced < 6h ago), else the latest Fishbowl snapshot quantity (NULL = neither); page_button_color drives the Buy button. assets are ordered by sort_order (drag order on the product page), unordered last; alt_text/title come from email_asset_meta ("media-kit:<path>").';

grant select on public.storefront_products to anon, authenticated;
