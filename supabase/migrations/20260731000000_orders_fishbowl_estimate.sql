-- Fishbowl estimate push (pilot): when an order is pushed into Fishbowl as an
-- Estimate via POST /api/storefront-orders/[id]/estimate, record which SO it
-- became and when. The route also sets fishbowl_entered_at/by (the existing
-- fulfillment gate) and degrades gracefully while these columns are missing.
alter table public.orders add column if not exists fishbowl_estimate_num text;
alter table public.orders add column if not exists fishbowl_estimate_at timestamptz;
