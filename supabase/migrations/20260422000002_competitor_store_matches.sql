-- Match scraped competitor stores against existing customer bill-to / ship-to
-- addresses using trigram similarity.

create extension if not exists pg_trgm;

alter table competitor_stores
  add column if not exists matched_customer_id   text,
  add column if not exists matched_customer_name text,
  add column if not exists match_score           numeric,
  add column if not exists match_source          text
    check (match_source in ('billing','shipping'));

alter table scrape_runs
  add column if not exists matched_customers integer not null default 0;

create index if not exists idx_competitor_stores_matched_customer
  on competitor_stores (matched_customer_id);

-- Match fn: populates match fields for every store in a given run.
-- Returns the number of rows updated.
create or replace function match_competitor_stores(p_run_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  rows_updated integer;
begin
  with candidates as (
    select
      cs.id as store_id,
      c.customerid,
      c.customer_name,
      similarity(coalesce(c.billto_address,''), coalesce(cs.address,'')) as bill_score,
      similarity(coalesce(c.shipto_address,''), coalesce(cs.address,'')) as ship_score
    from competitor_stores cs
    join customer_contact_summary c
      on (
        (c.billto_zip is not null and c.billto_zip = cs.zip)
        or (c.shipto_zip is not null and c.shipto_zip = cs.zip)
        or (c.billto_state = cs.state and lower(c.billto_city) = lower(cs.city))
        or (c.shipto_state = cs.state and lower(c.shipto_city) = lower(cs.city))
      )
    where cs.run_id = p_run_id
      and cs.address is not null
  ),
  scored as (
    select
      store_id, customerid, customer_name,
      greatest(bill_score, ship_score) as best_score,
      case when bill_score >= ship_score then 'billing' else 'shipping' end as match_source
    from candidates
  ),
  best as (
    select distinct on (store_id)
      store_id, customerid, customer_name, best_score, match_source
    from scored
    where best_score >= 0.3
    order by store_id, best_score desc
  )
  update competitor_stores cs
  set matched_customer_id   = b.customerid,
      matched_customer_name = b.customer_name,
      match_score           = b.best_score,
      match_source          = b.match_source
  from best b
  where cs.id = b.store_id;

  get diagnostics rows_updated = row_count;
  return rows_updated;
end;
$$;

grant execute on function match_competitor_stores(uuid) to authenticated, service_role;
