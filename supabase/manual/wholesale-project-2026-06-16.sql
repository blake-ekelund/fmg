-- ════════════════════════════════════════════════════════════════════
-- Wholesale project — fulfillment fields on `orders`
-- (shipment tracking + Fishbowl entry state)
--
-- ⚠ Run this on the WHOLESALE Supabase project (the one behind
-- WHOLESALE_SUPABASE_URL — partner auth/profiles for redek.io +
-- naturalinspirations.com), NOT the FMG product database.
--
-- Paste the whole file into that project's SQL editor and run once.
-- Idempotent — safe to re-run. Follows wholesale-project-2026-06-15.sql.
--
-- Two halves of the same fulfillment workflow, both filled in by hand from the
-- FMG Purchases → order-detail view (no carrier API, no Fishbowl integration):
--   • Shipment tracking — carrier + tracking number; the portal links straight
--     to the carrier's own page (USPS / UPS / FedEx). shipped_at is stamped the
--     first time a number is saved.
--   • Fishbowl entry — once the order's details have been keyed into Fishbowl,
--     the team marks it here. This is the real fulfillment gate and replaces
--     the old "approved" stamp (approved_at/approved_by stay in the table but
--     are no longer used by the UI).
-- Writes go through the service-role key only, so RLS stays as-is.
-- ════════════════════════════════════════════════════════════════════

alter table public.orders
  -- Shipment tracking ──────────────────────────────────────────────────
  -- Carrier id: 'usps' | 'ups' | 'fedex'. Free text (no enum) so adding a
  -- carrier is a code-only change in lib/tracking.ts.
  add column if not exists carrier             text,
  -- Carrier tracking number, entered by hand. Linked out, never parsed.
  add column if not exists tracking_code       text,
  -- When the tracking number was first recorded (≈ ship date).
  add column if not exists shipped_at          timestamptz,
  -- Fishbowl entry ─────────────────────────────────────────────────────
  -- When the order's details were keyed into Fishbowl (the fulfillment gate
  -- that replaces "approved"); null = still needs entering.
  add column if not exists fishbowl_entered_at timestamptz,
  -- FMG user who entered it into Fishbowl.
  add column if not exists fishbowl_entered_by text;

comment on column public.orders.carrier is
  'Shipping carrier id (usps | ups | fedex). Drives the deep link in lib/tracking.ts; no carrier API.';
comment on column public.orders.tracking_code is
  'Carrier tracking number, recorded by hand from the Purchases view. Linked out, never parsed.';
comment on column public.orders.shipped_at is
  'When the tracking number was first saved (≈ ship date).';
comment on column public.orders.fishbowl_entered_at is
  'When the order was entered into Fishbowl from the Purchases view. The fulfillment gate that replaces approved_at; null = still needs entering.';
comment on column public.orders.fishbowl_entered_by is
  'FMG user who entered the order into Fishbowl.';

-- Make PostgREST pick up the new columns immediately — otherwise the API can
-- briefly report "Could not find the 'carrier' column ... in the schema
-- cache" until it auto-reloads.
notify pgrst, 'reload schema';

-- Sanity check — expects 5.
select count(*) as fulfillment_columns_added
from information_schema.columns
where table_name = 'orders'
  and column_name in (
    'carrier', 'tracking_code', 'shipped_at',
    'fishbowl_entered_at', 'fishbowl_entered_by'
  );
