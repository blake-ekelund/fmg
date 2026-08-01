-- Customer mapping for marketplace orders (Faire, MarketTime).
--
-- fishbowl_customer    — the EXACT Fishbowl customer name this order books
--                        under when pushed as an estimate. Stamped by the
--                        sync cron's matcher (email → normalized business
--                        name against customer_contact_summary); staff can
--                        correct it. NULL on a marketplace order = no match
--                        on file → the Purchases list shows a flag tag and
--                        the estimate push skips the order.
-- fishbowl_customer_id — the matched Fishbowl customerid, for reference.
--
-- D2C storefront orders ignore these (they book under the
-- FISHBOWL_ESTIMATE_CUSTOMER pilot env until real mapping lands).

alter table orders add column if not exists fishbowl_customer text;
alter table orders add column if not exists fishbowl_customer_id text;

comment on column orders.fishbowl_customer is
  'Exact Fishbowl customer name the estimate books under (marketplace orders; matcher-stamped, staff-correctable).';
comment on column orders.fishbowl_customer_id is
  'Matched Fishbowl customerid, for reference.';
