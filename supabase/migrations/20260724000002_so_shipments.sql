-- Per-carton shipment tracking, synced from Fishbowl (ship + shipcarton + carrier).
--
-- Fishbowl keeps shipping separate from the sales order: a `ship` header joined
-- to the SO by ship.soId = so.id, with one or more `shipcarton` rows carrying the
-- tracking number. This table is the synced snapshot of SHIPMENTS_SQL
-- (lib/fishbowlQueries.ts), full-replaced each run exactly like sales_orders_raw
-- / so_items_raw and stamped with the SAME sales_uploads.upload_id, so all three
-- move together.
--
-- `soid` links to sales_orders_raw.id (= Fishbowl so.id). An order can have many
-- rows (several cartons / several shipments). `dateshipped` is NULL until the
-- shipment actually ships — a pre-printed label has a number but no ship date.
-- `carrier` is the raw Fishbowl carrier.name (usually "RATESHOP"); the real
-- carrier is derived from the tracking number app-side (lib/tracking.ts).

create table if not exists public.so_shipments_raw (
  id             bigint generated always as identity primary key,
  soid           bigint not null,
  ordernum       text,
  shipmentnum    text,
  dateshipped    date,
  ship_status_id integer,
  carrier_id     integer,
  carrier        text,
  tracking_num   text not null,
  carton_num     integer,
  upload_id      uuid not null
);

comment on table public.so_shipments_raw is
  'Per-carton Fishbowl shipment tracking (soid → sales_orders_raw.id). Full-snapshot synced with sales_orders_raw under a shared upload_id.';
comment on column public.so_shipments_raw.carrier is
  'Raw Fishbowl carrier.name — usually "RATESHOP"; real carrier is derived from tracking_num app-side.';
comment on column public.so_shipments_raw.dateshipped is
  'Fishbowl ship.dateShipped — NULL until actually shipped (a pre-printed label has a number but no ship date).';

-- Orders are joined to their shipments by soid; the sync replaces by upload_id.
create index if not exists so_shipments_raw_soid_idx on public.so_shipments_raw (soid);
create index if not exists so_shipments_raw_upload_idx on public.so_shipments_raw (upload_id);

-- Same access model as sales_orders_raw: internal roles read; reps get NO direct
-- read — they receive tracking only through the portal orders API (service role,
-- agency-scoped). auth_is_internal() is defined in 20260708000001_portal_rls.sql.
alter table public.so_shipments_raw enable row level security;

drop policy if exists "internal read so_shipments_raw" on public.so_shipments_raw;
create policy "internal read so_shipments_raw" on public.so_shipments_raw
  for select to authenticated
  using (auth_is_internal());

-- Optional audit column so /integrations can report shipment counts per sync.
alter table if exists public.sales_uploads
  add column if not exists shipments_rows integer;
