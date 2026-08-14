-- Scheduled / "ship by" date for marketplace orders.
--
-- scheduled_ship_date — the Fishbowl SO `dateFirstShip` (the Faire/MarketTime
--                       ship-by window, e.g. 2026-09-15). Captured by the
--                       marketplace reconciliation cron when it matches an order
--                       to its Fishbowl SO. This is the TARGET ship date;
--                       `shipped_at` (from ship.dateShipped) is when it actually
--                       shipped. Both are surfaced on the Orders page.

alter table orders add column if not exists scheduled_ship_date date;

comment on column orders.scheduled_ship_date is
  'Fishbowl SO dateFirstShip (scheduled/ship-by date) for marketplace orders; captured by reconciliation. shipped_at is the actual ship date.';
