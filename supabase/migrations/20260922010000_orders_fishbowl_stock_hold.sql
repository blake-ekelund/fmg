-- Why an order was held back from Fishbowl for stock, in plain words.
--
-- The estimate push now checks Point B / Synapse before it writes anything:
-- if the warehouse doesn't hold enough of a part, the order is not pushed.
-- Without somewhere to put that verdict it would exist only in a cron's JSON
-- response, which nobody reads — the order would simply sit on the Orders page
-- as "Needs Fishbowl" with no explanation, which is exactly the failure mode
-- the check was built to end.
--
-- Free text rather than structured JSON on purpose: this column is read by a
-- person deciding whether to wait for stock, cut the order, or override. The
-- structured check is recomputed live by /api/storefront-orders/[id]/fishbowl-check
-- whenever anyone actually wants to act on it.
--
-- Also set (not cleared) when a push went out over an override, so a
-- deliberately short-shipped order can be found again later.

alter table public.orders
  add column if not exists fishbowl_stock_hold text;

comment on column public.orders.fishbowl_stock_hold is
  'Why the Fishbowl estimate push was held back (or pushed anyway) on Point B stock. Null = no stock problem at the last push attempt. See lib/orderStockCheck.ts.';
