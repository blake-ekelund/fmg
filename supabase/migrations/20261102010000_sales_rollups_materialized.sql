-- Reports were slow to change period: sales_by_product_day_channel is a plain
-- view, so every request re-aggregated ALL Fishbowl history (~400–700 ms per
-- 1,000-row page, and year to date is ~13 pages per widget).
--
-- These are the same rows, stored: built once after each Fishbowl sales sync
-- (cron + the manual upload both call refresh_sales_rollups()), indexed on the
-- date. `id` gives reports a unique, stable order to page by, and lets the
-- refresh run CONCURRENTLY so reports keep reading while it rebuilds.
--
-- The views stay as they are (the Sales pages and dashboard read them); reports
-- read these and fall back to the views if they're missing.

create materialized view if not exists public.sales_by_product_day_mat as
select
  row_number() over (order by day, segment, productnum, typename, brand, display_name, fragrance) as id,
  day, month, segment, productnum, display_name, fragrance, typename, brand, units_fulfilled, revenue
from public.sales_by_product_day_channel;

create unique index if not exists sales_by_product_day_mat_id on public.sales_by_product_day_mat (id);
create index if not exists sales_by_product_day_mat_day on public.sales_by_product_day_mat (day);
create index if not exists sales_by_product_day_mat_type_day on public.sales_by_product_day_mat (typename, day);

create materialized view if not exists public.sales_by_product_month_mat as
select
  row_number() over (order by month, segment, productnum, typename, brand, display_name, fragrance) as id,
  month, segment, productnum, display_name, fragrance, typename, brand,
  sum(units_fulfilled) as units_fulfilled,
  sum(revenue)         as revenue
from public.sales_by_product_day_mat
group by month, segment, productnum, display_name, fragrance, typename, brand;

create unique index if not exists sales_by_product_month_mat_id on public.sales_by_product_month_mat (id);
create index if not exists sales_by_product_month_mat_month on public.sales_by_product_month_mat (month);
create index if not exists sales_by_product_month_mat_type_month on public.sales_by_product_month_mat (typename, month);

grant select on public.sales_by_product_day_mat to authenticated;
grant select on public.sales_by_product_month_mat to authenticated;

-- Rebuild both after new sales land. Day first — month is built from it.
create or replace function public.refresh_sales_rollups()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.sales_by_product_day_mat;
  refresh materialized view concurrently public.sales_by_product_month_mat;
end;
$$;

grant execute on function public.refresh_sales_rollups() to authenticated, service_role;
