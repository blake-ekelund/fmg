-- Performance rewrite of match_competitor_stores.
--
-- Previous versions used a JOIN with OR predicates, which prevented Postgres
-- from using hash or index joins — it fell back to a nested loop against the
-- entire customer_contact_summary view for every scraped store, which can
-- blow up into tens of millions of comparisons + trigram similarity calls.
--
-- This version:
--   1. MATERIALIZED CTEs so customer_contact_summary is scanned exactly once.
--   2. Candidates built via UNION ALL of single-equality joins, each of which
--      can use a hash join independently.

create or replace function match_competitor_stores(p_run_id uuid)
returns integer
language plpgsql
security definer
as $func$
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
  ns as materialized (
    select
      cs.id,
      lower(cs.address)                                   as addr_lc,
      lower(trim(cs.city))                                as city_n,
      upper(coalesce(sm.code, nullif(trim(cs.state),''))) as state_n,
      substring(trim(cs.zip), 1, 5)                       as zip5
    from competitor_stores cs
    left join state_map sm on lower(trim(cs.state)) = sm.full_name
    where cs.run_id = p_run_id and cs.address is not null
  ),
  nc as materialized (
    select
      c.customerid,
      c.customer_name,
      lower(coalesce(c.billto_address,''))                      as b_addr_lc,
      lower(coalesce(c.shipto_address,''))                      as s_addr_lc,
      lower(trim(c.billto_city))                                as b_city,
      upper(coalesce(bm.code, nullif(trim(c.billto_state),''))) as b_state,
      substring(trim(c.billto_zip), 1, 5)                       as b_zip5,
      lower(trim(c.shipto_city))                                as s_city,
      upper(coalesce(sm2.code, nullif(trim(c.shipto_state),''))) as s_state,
      substring(trim(c.shipto_zip), 1, 5)                       as s_zip5
    from customer_contact_summary c
    left join state_map bm  on lower(trim(c.billto_state)) = bm.full_name
    left join state_map sm2 on lower(trim(c.shipto_state)) = sm2.full_name
  ),
  candidates as (
    select ns.id as store_id, ns.addr_lc, nc.customerid, nc.customer_name, nc.b_addr_lc, nc.s_addr_lc
    from ns join nc on nc.b_zip5 = ns.zip5
    where nc.b_zip5 is not null and ns.zip5 is not null
    union all
    select ns.id, ns.addr_lc, nc.customerid, nc.customer_name, nc.b_addr_lc, nc.s_addr_lc
    from ns join nc on nc.s_zip5 = ns.zip5
    where nc.s_zip5 is not null and ns.zip5 is not null
    union all
    select ns.id, ns.addr_lc, nc.customerid, nc.customer_name, nc.b_addr_lc, nc.s_addr_lc
    from ns join nc on nc.b_state = ns.state_n and nc.b_city = ns.city_n
    where nc.b_state is not null and ns.state_n is not null
    union all
    select ns.id, ns.addr_lc, nc.customerid, nc.customer_name, nc.b_addr_lc, nc.s_addr_lc
    from ns join nc on nc.s_state = ns.state_n and nc.s_city = ns.city_n
    where nc.s_state is not null and ns.state_n is not null
  ),
  scored as (
    select
      store_id, customerid, customer_name,
      similarity(b_addr_lc, addr_lc) as bill_score,
      similarity(s_addr_lc, addr_lc) as ship_score
    from candidates
  ),
  best as (
    select distinct on (store_id)
      store_id, customerid, customer_name,
      greatest(bill_score, ship_score) as best_score,
      case when bill_score >= ship_score then 'billing' else 'shipping' end as match_source
    from scored
    where greatest(bill_score, ship_score) >= 0.3
    order by store_id, greatest(bill_score, ship_score) desc
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
$func$;
