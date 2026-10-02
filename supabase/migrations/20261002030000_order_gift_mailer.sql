-- Gift mailer flag
--
-- The pink gift mailer is free once a Sassy order clears $50, so the price in
-- orders.packaging can be 0 on an order that still needs the mailer. This flag
-- is what tells the packer; packaging stays the $ charged for it.

alter table public.orders
  add column if not exists gift_mailer boolean not null default false;

comment on column public.orders.gift_mailer is
  'Shopper chose the pink gift mailer (Sassy D2C). Pack in the mailer. Price, if any, is in packaging.';

-- Orders placed before this column existed only had a paid mailer.
update public.orders set gift_mailer = true where packaging > 0 and gift_mailer = false;
