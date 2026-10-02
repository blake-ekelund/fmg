-- Gift mailer packaging upcharge
--
-- Sassy's checkout offers a pink glamour bubble mailer for $2.50. The charge
-- lives in its own column rather than as an items[] line: every items[] entry
-- is treated as a sellable part (Fishbowl Sale line, divergence check, unit
-- counts), and subtotal stays goods-only so subtotal-vs-sale-lines still
-- reconciles. total already includes it. 0 = standard packaging.
--
-- The storefront only writes this column when the mailer is chosen, so it was
-- safe to deploy before this ran — but gift-mailer orders fail to insert until
-- it has.

alter table public.orders
  add column if not exists packaging numeric(10,2) not null default 0;

comment on column public.orders.packaging is
  'Gift-mailer packaging upcharge in dollars (Sassy D2C). > 0 = pack in the pink mailer. Included in total, excluded from subtotal.';
