-- Improve competitor-store → customer matching by normalizing state and zip
-- before the join. Storepoint returns 2-char states and ZIP+4 ("MD",
-- "20878-1234") while customer records may have full state names ("Maryland")
-- and 5-digit zips ("20878"). Address similarity is also computed case-
-- insensitively.

create or replace function match_competitor_stores(p_run_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  rows_updated integer;
begin
  with
  state_map(full_name, code) as (
    values
      ('alabama','AL'),('alaska','AK'),('arizona','AZ'),('arkansas','AR'),
      ('california','CA'),('colorado','CO'),('connecticut','CT'),('delaware','DE'),
      ('florida','FL'),('georgia','GA'),('hawaii','HI'),('idaho','ID'),
      ('illinois','IL'),('indiana','IN'),('iowa','IA'),('kansas','KS'),
      ('kentucky','KY'),('louisiana','LA'),('maine','ME'),('maryland','MD'),
      ('massachusetts','MA'),('michigan','MI'),('minnesota','MN'),('mississippi','MS'),
      ('missouri','MO'),('montana','MT'),('nebraska','NE'),('nevada','NV'),
      ('new hampshire','NH'),('new jersey','NJ'),('new mexico','NM'),('new york','NY'),
      ('north carolina','NC'),('north dakota','ND'),('ohio','OH'),('oklahoma','OK'),
      ('oregon','OR'),('pennsylvania','PA'),('rhode island','RI'),('south carolina','SC'),
      ('south dakota','SD'),('tennessee','TN'),('texas','TX'),('utah','UT'),
      ('vermont','VT'),('virginia','VA'),('washington','WA'),('west virginia','WV'),
      ('wisconsin','WI'),('wyoming','WY'),('district of columbia','DC')
  ),
  norm_stores as (
    select
      cs.id,
      cs.address,
      lower(trim(cs.city))                                      as city_n,
      upper(coalesce(sm.code, nullif(trim(cs.state),'')))       as state_n,
      substring(trim(cs.zip), 1, 5)                             as zip5
    from competitor_stores cs
    left join state_map sm on lower(trim(cs.state)) = sm.full_name
    where cs.run_id = p_run_id and cs.address is not null
  ),
  norm_customers as (
    select
      c.customerid,
      c.customer_name,
      c.billto_address,
      c.shipto_address,
      lower(trim(c.billto_city))                                      as b_city,
      upper(coalesce(bm.code, nullif(trim(c.billto_state),'')))       as b_state,
      substring(trim(c.billto_zip), 1, 5)                             as b_zip5,
      lower(trim(c.shipto_city))                                      as s_city,
      upper(coalesce(sm2.code, nullif(trim(c.shipto_state),'')))      as s_state,
      substring(trim(c.shipto_zip), 1, 5)                             as s_zip5
    from customer_contact_summary c
    left join state_map bm  on lower(trim(c.billto_state)) = bm.full_name
    left join state_map sm2 on lower(trim(c.shipto_state)) = sm2.full_name
  ),
  candidates as (
    select
      ns.id as store_id,
      nc.customerid,
      nc.customer_name,
      similarity(lower(coalesce(nc.billto_address,'')), lower(ns.address)) as bill_score,
      similarity(lower(coalesce(nc.shipto_address,'')), lower(ns.address)) as ship_score
    from norm_stores ns
    join norm_customers nc on (
      (nc.b_zip5 is not null and nc.b_zip5 = ns.zip5)
      or (nc.s_zip5 is not null and nc.s_zip5 = ns.zip5)
      or (nc.b_state is not null and nc.b_state = ns.state_n and nc.b_city = ns.city_n)
      or (nc.s_state is not null and nc.s_state = ns.state_n and nc.s_city = ns.city_n)
    )
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
