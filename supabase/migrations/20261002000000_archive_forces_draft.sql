-- Archiving a product (is_forecasted = false) always takes it off the
-- storefronts (storefront_channel = 'off', i.e. Draft). Enforced here so
-- every write path — /products list + detail, inventory modals, scripts —
-- gets the same rule. Un-archiving does NOT republish; that stays a
-- deliberate choice on the product's Details tab.

create or replace function public.inventory_products_archive_to_draft()
returns trigger
language plpgsql
as $$
begin
  if new.is_forecasted = false then
    new.storefront_channel := 'off';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_products_archive_to_draft on public.inventory_products;
create trigger inventory_products_archive_to_draft
  before insert or update of is_forecasted, storefront_channel
  on public.inventory_products
  for each row
  execute function public.inventory_products_archive_to_draft();

-- Backfill: anything already archived but still published goes to Draft.
update public.inventory_products
set storefront_channel = 'off'
where is_forecasted = false
  and storefront_channel <> 'off';
