-- Compact rewrite of match_competitor_stores.
-- Zip-5 equality JOINs (via UNION ALL so each side can hash-join), then
-- trigram similarity on lowercased addresses, ≥0.3 wins. Short enough to paste
-- into the Supabase SQL editor in one shot.

create or replace function match_competitor_stores(p_run_id uuid)
returns integer
language plpgsql
security definer
as $func$
declare
  rows_updated integer;
begin
  with ns as materialized (
    select id,
           lower(address)                as addr,
           substring(trim(zip), 1, 5)    as zip5
    from competitor_stores
    where run_id = p_run_id
      and address is not null
      and zip is not null
  ),
  pairs as (
    select ns.id as sid, ns.addr, c.customerid as cid, c.customer_name,
           lower(coalesce(c.billto_address,'')) as b,
           lower(coalesce(c.shipto_address,'')) as s
    from ns join customer_contact_summary c
      on substring(trim(c.billto_zip), 1, 5) = ns.zip5
    union all
    select ns.id, ns.addr, c.customerid, c.customer_name,
           lower(coalesce(c.billto_address,'')),
           lower(coalesce(c.shipto_address,''))
    from ns join customer_contact_summary c
      on substring(trim(c.shipto_zip), 1, 5) = ns.zip5
  ),
  scored as (
    select sid, cid, customer_name,
           greatest(similarity(b, addr), similarity(s, addr)) as score,
           case when similarity(b, addr) >= similarity(s, addr)
                then 'billing' else 'shipping' end            as source
    from pairs
  ),
  best as (
    select distinct on (sid) sid, cid, customer_name, score, source
    from scored
    where score >= 0.3
    order by sid, score desc
  )
  update competitor_stores cs
  set matched_customer_id   = b.cid,
      matched_customer_name = b.customer_name,
      match_score           = b.score,
      match_source          = b.source
  from best b
  where cs.id = b.sid;

  get diagnostics rows_updated = row_count;
  return rows_updated;
end;
$func$;
