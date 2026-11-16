-- Inventory: hand-set "On Order" for a SKU that survives Fishbowl syncs.
--
-- On Order comes from Fishbowl and lands on inventory_snapshot_items. Typing
-- over it on /inventory used to edit only the current snapshot row, so the next
-- Fishbowl sync (three a day) or upload wrote a fresh snapshot and the typed
-- number vanished. Now the typed number lives here, and every new snapshot (the
-- sync and the manual upload) writes it onto the part's row, so every reader
-- (forecast, dashboard, Purchasing, bell, reports) sees it without changes.
--
-- Sticky by design: it stays until someone resets it on /inventory. A reset puts
-- Fishbowl's own figure back, which is kept fresh in fishbowl_on_order by every
-- sync while the override is in place.
--
-- Read and written by the server only, so RLS is on with no policies.

create table if not exists public.inventory_on_order_overrides (
  part text primary key,
  units numeric(12, 2) not null check (units >= 0),
  -- Fishbowl's own on-order figure, refreshed by each snapshot; restored on reset.
  fishbowl_on_order numeric(12, 2),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.inventory_on_order_overrides enable row level security;
