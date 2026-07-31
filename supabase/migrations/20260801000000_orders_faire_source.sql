-- Faire marketplace orders flow into the same `orders` table as storefront
-- orders (and ride the same Fishbowl estimate push + tracking pipeline).
--
-- source       — 'storefront' (default; today's checkout rows) or 'faire'.
-- external_ref — the marketplace's own order id (Faire display id). Unique
--                per source, so the sync cron can re-run forever without
--                duplicating an order.

alter table orders add column if not exists source text not null default 'storefront';
alter table orders add column if not exists external_ref text;

create unique index if not exists idx_orders_source_external_ref
  on orders (source, external_ref)
  where external_ref is not null;

comment on column orders.source is
  'Where the order originated: storefront checkout or the Faire marketplace.';
comment on column orders.external_ref is
  'Marketplace order id (e.g. Faire display id) — dedupe key for sync crons.';
