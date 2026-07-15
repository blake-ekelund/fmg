-- Daily-grain companion to dashboard_monthly_sales, powering the dashboard's
-- Daily Sales Log widget (month-to-date through yesterday).
--
-- Same source + business rules as dashboard_monthly_sales so the numbers
-- reconcile exactly, only grouped by calendar day and bounded by an explicit
-- [p_start, p_end] range (the widget passes 1st-of-month → yesterday, computed
-- in the viewer's local time):
--   * revenue  = SUM(line-item totalprice), SUBTOTAL/SHIPPING lines excluded
--   * segment  = D2C when customerid is a storefront account, else Wholesale
--   * brand    = inventory_products.brand (NULL p_brand = all brands)
--   * source   = the *_current views (current upload only)

create or replace function public.dashboard_daily_sales(
  p_brand text default null,
  p_start date default null,
  p_end   date default null
)
returns table(day date, segment text, revenue numeric, orders bigint)
language sql
stable security definer
as $function$
  select
    s.datecompleted::date as day,
    case when s.customerid in ('12345','12483','13704') then 'D2C' else 'Wholesale' end as segment,
    sum(soi.totalprice) as revenue,
    count(distinct s.id) as orders
  from sales_orders_current s
  join so_items_current soi on soi.soid = s.id
  join inventory_products ip on ip.part = soi.productnum
  where (p_start is null or s.datecompleted::date >= p_start)
    and (p_end   is null or s.datecompleted::date <= p_end)
    and upper(soi.productnum) not in ('SUBTOTAL','SHIPPING')
    and upper(coalesce(soi.description,'')) not in ('SUBTOTAL','SHIPPING')
    and (p_brand is null or ip.brand = p_brand)
  group by 1, 2
  order by 1, 2;
$function$;

grant execute on function public.dashboard_daily_sales(text, date, date) to authenticated;
