-- Product-month sales, split by channel, so the sales-analysis page can be read
-- three ways: all business, wholesale only, D2C only.
--
-- `sales_by_product_month_enriched` (what /sales read before this) has no
-- channel dimension, and the channel split that does exist —
-- dashboard_monthly_sales — is order-grain with no product dimension. Neither
-- could answer "which products drive D2C", so this view carries both.
--
-- The business rules are copied from dashboard_daily_sales / dashboard_monthly_sales
-- rather than reinvented, so the three pages reconcile with the dashboard:
--   * revenue  = SUM(line-item totalprice), SUBTOTAL/SHIPPING lines excluded
--   * segment  = D2C when customerid is a storefront account, else Wholesale
--   * brand    = inventory_products.brand
--   * source   = the *_current views (current upload only)
--
-- Verified against dashboard_monthly_sales for Jan 2025 before shipping:
-- D2C 5,084 and Wholesale 99,126 both to the dollar. Note this makes /sales
-- agree with the dashboard where it previously differed by ~0.3% — the
-- enriched view it used counts a slightly different set of line items.

create or replace view public.sales_by_product_month_channel
with (security_invoker = off) as
select
  date_trunc('month', s.datecompleted)::date                     as month,
  case
    when s.customerid in ('12345','12483','13704') then 'D2C'
    else 'Wholesale'
  end                                                            as segment,
  soi.productnum,
  coalesce(ip.display_name, soi.productnum)                      as display_name,
  ip.fragrance,
  soi.typename,
  ip.brand,
  sum(coalesce(soi.qtyfulfilled, soi.qtyordered, 0))             as units_fulfilled,
  sum(soi.totalprice)                                            as revenue
from sales_orders_current s
join so_items_current   soi on soi.soid = s.id
join inventory_products ip  on ip.part  = soi.productnum
where s.datecompleted is not null
  and upper(soi.productnum) not in ('SUBTOTAL','SHIPPING')
  and upper(coalesce(soi.description,'')) not in ('SUBTOTAL','SHIPPING')
group by 1, 2, 3, 4, 5, 6, 7;

grant select on public.sales_by_product_month_channel to authenticated;
