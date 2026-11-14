-- Inventory: hand-set demand for a SKU in a specific month.
--
-- The forecast's month-by-month demand (lib/seasonalDemand.ts) is calculated:
-- last year's units for the month × the product's trend, or a flat avg / mo
-- for products without history. People know things the calculation doesn't (a
-- retailer launch, a promo, a discontinued scent), so each SKU × month can be
-- overridden in the Inventory → Demand view.
--
-- An override is sticky by design: the nightly sales sync and the recalculated
-- forecast never touch it. It goes away only when someone resets it (one month,
-- or every month for the SKU). Months are calendar months, so an override for
-- a month that has passed simply stops applying.
--
-- Read and written by the server only (/api/inventory/demand-overrides and the
-- shared demand builder), so RLS is on with no policies.

create table if not exists public.inventory_demand_overrides (
  part text not null,
  -- yyyy-mm, the calendar month this replaces the forecast for.
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  units numeric(12, 2) not null check (units >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (part, month)
);

create index if not exists inventory_demand_overrides_month_idx
  on public.inventory_demand_overrides (month);

alter table public.inventory_demand_overrides enable row level security;
