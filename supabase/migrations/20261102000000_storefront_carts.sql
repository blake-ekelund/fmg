-- Storefront carts saved server-side (Sassy + NI)
-- ==================================================================
-- Each storefront still keeps its bag in localStorage, but now mirrors it
-- here so it can be handed across stores: a link from sassyandco.com to
-- redek.io (and back) carries `?bag=<cart id>`, and the receiving store
-- either restores its own bag or remembers the sister bag to show
-- "you also have N items in your other bag".
--
-- The cart id (uuid) is the only key — unguessable, never listed. RLS on,
-- NO policies: both storefronts reach this table with the service role only.
-- Idempotent.
-- ==================================================================

create table if not exists public.storefront_carts (
  id          uuid primary key default gen_random_uuid(),
  store       text not null check (store in ('sassy', 'ni')),
  items       jsonb not null default '[]'::jsonb,
  item_count  integer not null default 0,
  subtotal    numeric(10, 2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.storefront_carts enable row level security;

create index if not exists storefront_carts_updated_idx
  on public.storefront_carts (updated_at);

-- Carts idle for 60 days are gone for good (the storefronts already ignore
-- anything idle past 30). pg_cron is already on for the blog auto-publish.
select cron.schedule(
  'storefront-carts-prune',
  '17 4 * * *',
  $$delete from public.storefront_carts where updated_at < now() - interval '60 days'$$
);
