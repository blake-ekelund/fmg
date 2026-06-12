-- Stricter match rule:
--   • state must match (after norm_state)
--   • address similarity ≥ 0.5 on either billing or shipping
--   • if both addresses start with a numeric street number, those numbers
--     must be equal (avoids "123 Main St" vs "125 Main St" false positives)

create or replace function match_competitor_stores(p_run_id uuid)
returns integer
language plpgsql
security definer
as $func$
declare rows_updated integer;
begin
  -- Wipe previous matches on this run so re-invocations don't leave stale rows.
  update competitor_stores
    set matched_customer_id = null, matched_customer_name = null,
        match_score = null, match_source = null
    where run_id = p_run_id;

  with ns as materialized (
    select id, lower(address) as addr, norm_state(state) as st
    from competitor_stores
    where run_id = p_run_id
      and address is not null and state is not null
  ),
  pairs as (
    select ns.id as sid, ns.addr, c.customerid as cid, c.customer_name,
           lower(coalesce(c.billto_address,'')) as caddr,
           'billing'::text as src
    from ns join customer_contact_summary c
      on norm_state(c.billto_state) = ns.st
    where c.billto_address is not null
    union all
    select ns.id, ns.addr, c.customerid, c.customer_name,
           lower(coalesce(c.shipto_address,'')), 'shipping'::text
    from ns join customer_contact_summary c
      on norm_state(c.shipto_state) = ns.st
    where c.shipto_address is not null
  ),
  scored as (
    select sid, cid, customer_name, src,
           similarity(caddr, addr) as score,
           caddr, addr
    from pairs
  ),
  best as (
    select distinct on (sid) sid, cid, customer_name, score, src
    from scored
    where score >= 0.5
      and (
        not (split_part(caddr, ' ', 1) ~ '^\d+$'
             and split_part(addr, ' ', 1) ~ '^\d+$')
        or split_part(caddr, ' ', 1) = split_part(addr, ' ', 1)
      )
    order by sid, score desc
  )
  update competitor_stores cs
  set matched_customer_id   = b.cid,
      matched_customer_name = b.customer_name,
      match_score           = b.score,
      match_source          = b.src
  from best b
  where cs.id = b.sid;

  get diagnostics rows_updated = row_count;
  return rows_updated;
end;
$func$;
