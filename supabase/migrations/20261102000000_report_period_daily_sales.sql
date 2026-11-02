-- Custom reports: one period for the whole report, down to single days.
--
-- 1. sales_by_product_day_channel — the same rows as sales_by_product_month_channel
--    (same revenue / segment / brand rules, so the two reconcile to the dollar)
--    but per completed DAY, so a report can compare Nov 1–2 2026 with Nov 1–2
--    2025. It keeps a `month` column too, so a month-grouped widget reads the
--    same whether it runs on the monthly or the daily view.
-- 2. custom_reports.period — the report's default period ({ preset, from, to,
--    compare }). Viewers can look at any period; the owner saves the default,
--    and the scheduled email uses it.

create or replace view public.sales_by_product_day_channel
with (security_invoker = off) as
select
  s.datecompleted::date                                          as day,
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
group by 1, 2, 3, 4, 5, 6, 7, 8;

grant select on public.sales_by_product_day_channel to authenticated;

alter table public.custom_reports add column if not exists period jsonb;
