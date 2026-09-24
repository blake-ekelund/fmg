-- Per-person, per-brand D2C order activity, so an automation can target
-- "Sassy buyers" rather than every D2C customer.
--
-- d2c_customer_contact (the audience source) has no brand: all storefront
-- orders land on the same Fishbowl customerids and the PO prefix isn't a
-- reliable brand signal. Brand comes from the line items instead, the same
-- way the sales views derive it (so_items_current → inventory_products.brand).
--
-- person_key matches d2c_customer_contact.person_key (lowercased email). A
-- customer who bought both brands has two rows, each with its own dates, so
-- "N days after their last Sassy order" is measured from the Sassy order even
-- if they bought NI since.
--
-- Read by the automations cron (trigger_config.brand). Service-role only in
-- practice; granted to authenticated to match the other reporting views.

create or replace view public.d2c_customer_brand_activity
with (security_invoker = off) as
select
  lower(trim(s.email))              as person_key,
  ip.brand,
  min(s.datecompleted)::date        as first_order_date,
  max(s.datecompleted)::date        as last_order_date,
  count(distinct s.id)              as order_count
from sales_orders_current s
join so_items_current   soi on soi.soid = s.id
join inventory_products ip  on ip.part  = soi.productnum
where s.customerid in ('12345','12483','13704')
  and s.datecompleted is not null
  and coalesce(trim(s.email), '') <> ''
  and ip.brand is not null
group by 1, 2;

grant select on public.d2c_customer_brand_activity to authenticated;
