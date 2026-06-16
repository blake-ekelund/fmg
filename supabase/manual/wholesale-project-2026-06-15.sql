-- ════════════════════════════════════════════════════════════════════
-- Wholesale project catch-up — sales-order / invoice fields on `orders`
--
-- ⚠ Run this on the WHOLESALE Supabase project (the one behind
-- WHOLESALE_SUPABASE_URL — partner auth/profiles for redek.io +
-- naturalinspirations.com), NOT the FMG product database.
--
-- Paste the whole file into that project's SQL editor and run once.
-- Idempotent. Follows wholesale-project-2026-06-12.sql (which created the
-- orders table + profiles.sales_rep / signup_store).
--
-- Promotes the lean checkout row into a full invoice: frozen bill-to /
-- ship-to snapshots, a contact phone, the FMG sales rep, payment terms, the
-- originating storefront, a tax line (0 for now — deferred), a structured
-- discount breakdown, and an approval stamp set from the FMG Purchases view.
-- Writes go through the service-role key only, so RLS stays as-is.
-- ════════════════════════════════════════════════════════════════════

alter table public.orders
  -- Frozen address snapshots. NOT a FK to `addresses` — an invoice must not
  -- change when the partner later edits their address book.
  -- Shape: { name, company?, line1, line2?, city, state, postal_code,
  --          country, phone?, email? }
  add column if not exists ship_to        jsonb,
  add column if not exists bill_to        jsonb,
  add column if not exists phone          text,
  -- Snapshot of the FMG sales rep on the buyer profile (wholesale only).
  add column if not exists sales_rep      text,
  add column if not exists payment_terms  text not null default 'credit card',
  -- Which storefront placed it: 'sassy' | 'ni'. Drives the invoice number
  -- prefix (SASSY-##### / NI-#####).
  add column if not exists store          text,
  -- Tax is deferred — the column exists so the invoice has a home for it.
  add column if not exists tax            numeric not null default 0,
  -- Total discount + a typed breakdown for the invoice's Discount lines.
  -- discounts shape: [{ type: 'promo'|'perk'|'tester', label, amount }]
  add column if not exists discount       numeric not null default 0,
  add column if not exists discounts      jsonb,
  -- Approval stamp (set from the FMG Purchases → order detail view).
  add column if not exists approved_at    timestamptz,
  add column if not exists approved_by    text;

comment on column public.orders.ship_to is
  'Frozen ship-to snapshot at order time. Never a FK — invoices must not mutate when the address book changes.';
comment on column public.orders.bill_to is
  'Frozen bill-to snapshot at order time.';
comment on column public.orders.phone is
  'Order contact phone (buyer at checkout, or partner profile phone).';
comment on column public.orders.sales_rep is
  'FMG sales rep on the buyer profile at order time (wholesale only).';
comment on column public.orders.payment_terms is
  'Payment terms shown on the invoice. Defaults to credit card.';
comment on column public.orders.store is
  'Originating storefront: sassy | ni. Drives the order-number prefix.';
comment on column public.orders.tax is
  'Sales tax. 0 for now — tax calculation is deferred.';
comment on column public.orders.discount is
  'Total discount applied (promo + perks + free testers).';
comment on column public.orders.discounts is
  'Typed discount breakdown for the invoice: [{ type, label, amount }].';
comment on column public.orders.approved_at is
  'When the order was approved in the FMG Purchases view.';
comment on column public.orders.approved_by is
  'FMG user who approved the order.';

-- Existing test rows (SO-1001..) predate the storefront stamp. ni has no
-- checkout yet, so the legacy rows are all sassy — tag them so they read
-- SASSY-#### on the invoice. Idempotent (only touches null).
update public.orders set store = 'sassy' where store is null;

-- Make PostgREST pick up the new columns immediately — otherwise the API can
-- briefly report "Could not find the 'approved_at' column ... in the schema
-- cache" until it auto-reloads.
notify pgrst, 'reload schema';

-- Sanity check — expects 11.
select count(*) as invoice_columns_added
from information_schema.columns
where table_name = 'orders'
  and column_name in (
    'ship_to','bill_to','phone','sales_rep','payment_terms','store',
    'tax','discount','discounts','approved_at','approved_by'
  );

-- ════════════════════════════════════════════════════════════════════
-- OPTIONAL · RUN ONCE — start invoice numbers at SASSY-10000
--
-- `number` is `bigint generated always as identity (start 1001)`. This jumps
-- the NEXT order to 10000. ⚠ NOT idempotent — run it a single time, before
-- placing real orders. Re-running once 10000+ exists collides on the unique
-- number index. The 1001-range test rows stay as-is; the gap is harmless.
--
--   alter table public.orders alter column number restart with 10000;
-- ════════════════════════════════════════════════════════════════════
