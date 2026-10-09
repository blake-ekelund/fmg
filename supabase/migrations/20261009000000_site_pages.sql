-- Storefront pages edited in FMG (Website editor, /storefronts/website)
--
-- One row = one page on one storefront (v1: Sassy 'home'). The editor
-- autosaves into draft_blocks; Publish copies the draft into
-- published_blocks, which is the only thing the stores can read (through the
-- storefront_site_pages view below). Block shape: lib/site/pageBlocks.ts,
-- byte-identical in store/sassy src/lib/fmg/pageBlocks.ts.
--
-- No row (or no published_blocks) = the store renders its built-in default,
-- so the store can deploy before this migration is applied.

create table if not exists public.site_pages (
  id               uuid primary key default gen_random_uuid(),
  brand            text not null check (brand in ('Sassy', 'NI')),
  slug             text not null,
  draft_blocks     jsonb not null default '[]'::jsonb,
  published_blocks jsonb,
  published_at     timestamptz,
  published_by     uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (brand, slug)
);

comment on table public.site_pages is
  'Storefront page content (blocks) edited on FMG /storefronts/website. Stores read published_blocks via storefront_site_pages.';

-- Every publish, newest first in the editor's History list (restore = copy
-- back into the draft).
create table if not exists public.site_page_versions (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.site_pages (id) on delete cascade,
  blocks       jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null
);

create index if not exists site_page_versions_page_idx
  on public.site_page_versions (page_id, published_at desc);

-- API routes use the service role; no client policies on purpose.
alter table public.site_pages enable row level security;
alter table public.site_page_versions enable row level security;

-- Public, published-only read for the storefronts (anon key).
create or replace view public.storefront_site_pages
with (security_invoker = off) as
select brand, slug, published_blocks as blocks, published_at
from public.site_pages
where published_blocks is not null;

grant select on public.storefront_site_pages to anon, authenticated;
