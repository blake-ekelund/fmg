-- RLS policies for the competitor locator tables.
-- Internal tool; authenticated users get full access. Anon has none.

alter table competitors        enable row level security;
alter table scrape_runs        enable row level security;
alter table competitor_stores  enable row level security;

-- competitors
drop policy if exists "competitors auth all"        on competitors;
create policy "competitors auth all" on competitors
  for all to authenticated
  using (true) with check (true);

-- scrape_runs
drop policy if exists "scrape_runs auth all"        on scrape_runs;
create policy "scrape_runs auth all" on scrape_runs
  for all to authenticated
  using (true) with check (true);

-- competitor_stores
drop policy if exists "competitor_stores auth all"  on competitor_stores;
create policy "competitor_stores auth all" on competitor_stores
  for all to authenticated
  using (true) with check (true);
