-- YoY sales-driver analysis for the dashboard's "Why did sales change?" panel.
--
-- Returns per-product revenue + units for two windows — the current period
-- ("cur") and the same period a year earlier ("prior") — so the app can
-- decompose the year-over-year revenue change into volume, mix, price, and
-- new/lost-product effects (a price-volume-mix bridge).
--
-- Same source + business rules as dashboard_daily_sales / dashboard_monthly_sales
-- (storefront customerids = D2C, SUBTOTAL/SHIPPING lines excluded, brand from
-- inventory_products, *_current views) so the totals reconcile exactly. Units =
-- qtyfulfilled, falling back to qtyordered (mirrors the app's order-item view).
--
-- The caller passes both windows explicitly so a partial current month (1st →
-- yesterday) is compared against the identical 1st → same-day window last year.

create or replace function public.dashboard_sales_drivers(
  p_brand       text,
  p_cur_start   date,
  p_cur_end     date,
  p_prior_start date,
  p_prior_end   date
)
returns table(
  period      text,
  segment     text,
  brand       text,
  productnum  text,
  description text,
  revenue     numeric,
  units       numeric
)
language sql
stable security definer
as $function$
  select
    case
      when s.datecompleted::date between p_cur_start and p_cur_end then 'cur'
      else 'prior'
    end as period,
    case when s.customerid in ('12345','12483','13704') then 'D2C' else 'Wholesale' end as segment,
    coalesce(ip.brand, 'Unbranded') as brand,
    soi.productnum,
    max(soi.description) as description,
    sum(soi.totalprice) as revenue,
    sum(coalesce(soi.qtyfulfilled, soi.qtyordered, 0)) as units
  from sales_orders_current s
  join so_items_current soi on soi.soid = s.id
  join inventory_products ip on ip.part = soi.productnum
  where (
      s.datecompleted::date between p_cur_start and p_cur_end
      or s.datecompleted::date between p_prior_start and p_prior_end
    )
    and upper(soi.productnum) not in ('SUBTOTAL','SHIPPING')
    and upper(coalesce(soi.description,'')) not in ('SUBTOTAL','SHIPPING')
    and (p_brand is null or ip.brand = p_brand)
  group by 1, 2, 3, 4
  order by 4;
$function$;

grant execute on function public.dashboard_sales_drivers(text, date, date, date, date) to authenticated;
