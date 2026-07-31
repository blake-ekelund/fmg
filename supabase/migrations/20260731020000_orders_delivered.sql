-- Delivered tracking for storefront orders.
--
-- delivered_at       — set by the carrier-delivery-sync cron when the carrier's
--                      tracking API reports the package delivered.
-- delivered_email_at — the storefront's /api/orders/delivered endpoint claims
--                      this atomically before sending the customer's
--                      "your order was delivered" email (same exactly-once
--                      pattern as shipped_email_at).

alter table orders add column if not exists delivered_at timestamptz;
alter table orders add column if not exists delivered_email_at timestamptz;

comment on column orders.delivered_at is
  'Carrier reported the package delivered (carrier-delivery-sync cron).';
comment on column orders.delivered_email_at is
  'Customer delivered-email claimed/sent (storefront /api/orders/delivered).';
