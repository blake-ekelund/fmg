-- Saved widgets for the storefront Website editor
--
-- A widget is ONE block (a promo banner, an image + text, an embed …) saved
-- under a name for a store. Pages link to it with a { type: "widget",
-- widgetId } block instead of a copy, so editing the widget updates every
-- page that uses it. Like pages, a widget has a draft (autosaved by the
-- editor) and a published copy — publishing any page also publishes the
-- widgets it links to. The stores read only published copies, through the
-- storefront_site_widgets view. Block shape: lib/site/pageBlocks.ts.

create table if not exists public.site_widgets (
  id              uuid primary key default gen_random_uuid(),
  brand           text not null check (brand in ('Sassy', 'NI')),
  name            text not null,
  draft_block     jsonb not null,
  published_block jsonb,
  published_at    timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists site_widgets_brand_idx on public.site_widgets (brand, name);

comment on table public.site_widgets is
  'Reusable blocks for the storefront Website editor; pages link to them. Stores read published_block via storefront_site_widgets.';

-- API routes use the service role; no client policies on purpose.
alter table public.site_widgets enable row level security;

create or replace view public.storefront_site_widgets
with (security_invoker = off) as
select id, brand, published_block as block
from public.site_widgets
where published_block is not null;

grant select on public.storefront_site_widgets to anon, authenticated;
