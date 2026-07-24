-- SO header fields the invoice print shows but the sync didn't carry yet.
--
-- The Fishbowl SO print's info band shows Sales Rep / Payment Terms / FOB Point /
-- Carrier / Ship Service. These live on the `so` record (verified 2026-07-24) and
-- are now pulled by SALES_ORDERS_SQL; this adds the matching columns so the sync
-- can land them and rep-generated invoices match the office copy exactly.
--
-- ⚠ Apply this BEFORE the next sales sync runs — the sync now inserts these
-- columns, and the insert fails if they don't exist yet.

alter table if exists public.sales_orders_raw
  add column if not exists salesman text,
  add column if not exists payment_terms text,
  add column if not exists fob_point text,
  add column if not exists carrier text,
  add column if not exists ship_service text;

comment on column public.sales_orders_raw.salesman is
  'Fishbowl so.salesman — the sales rep / agency codename on the order.';
comment on column public.sales_orders_raw.carrier is
  'Fishbowl carrier.name via so.carrierId (SO-level carrier; usually "RATESHOP").';
