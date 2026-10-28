-- Purchasing settings: the ordering rules Fishbowl doesn't hold.
--
-- Fishbowl has a vendor-part minimum on only 4 parts and none for Kapra, and
-- its "last cost" can be years old. These two tables let staff set the real
-- rules from the Purchasing page (Ingredients & minimums drawer), and the order
-- list applies them:
--
--   purchasing_part_settings   per ingredient: minimum order, order in
--                              multiples of, a price that overrides Fishbowl's,
--                              lead time.
--   purchasing_vendor_settings per vendor: a minimum run total (e.g. Kapra
--                              makes at least 3,000 units of fill per run) and a
--                              per-item floor ("at least 500 of each fragrance").
--
-- Read and written only through /api/inventory/purchasing-settings (service
-- role, internal staff only), so RLS is on with no policies.

create table if not exists public.purchasing_part_settings (
  part         text primary key,
  min_qty      numeric,       -- never order less than this (stock unit)
  multiple     numeric,       -- round orders up to a multiple of this
  unit_price   numeric,       -- overrides Fishbowl's last PO price
  lead_days    integer,       -- overrides Fishbowl's vendor lead time
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.purchasing_vendor_settings (
  vendor          text primary key,   -- Fishbowl vendor name
  min_run_qty     numeric,            -- the whole order must reach this many units
  item_min_qty    numeric,            -- each item on the order at least this many
  lead_days       integer,            -- default lead time for this vendor's parts
  note            text,
  updated_by      text,
  updated_at      timestamptz not null default now()
);

alter table public.purchasing_part_settings enable row level security;
alter table public.purchasing_vendor_settings enable row level security;

comment on table public.purchasing_part_settings is
  'Per-ingredient ordering rules set on the Purchasing page (min order, multiple, price, lead time) — applied on top of Fishbowl.';
comment on table public.purchasing_vendor_settings is
  'Per-vendor ordering rules set on the Purchasing page (minimum run total, per-item minimum, lead time).';
