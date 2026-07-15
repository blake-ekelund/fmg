-- Sales Rep Portal: row-level-security as DEFENSE IN DEPTH.
--
-- The PRIMARY isolation boundary is the application layer: reps read data only
-- through /api/portal/* routes, which use the service-role key and scope every
-- query to the caller's own profiles.rep_agency_code (read server-side, never
-- trusted from the client). Service-role bypasses RLS, so these policies never
-- interfere with the portal API or the internal app's own service-role code.
--
-- These policies close the residual risk of a rep using their authenticated
-- session token to hit PostgREST directly. They:
--   • grant internal (non-rep) roles unchanged full read, and
--   • restrict access='rep' users to their own agency (base tables only).
--
-- Mirrors the profile-lookup pattern in 20260522000001_email_integration_rls.sql.
-- NOTE: customer_summary / customer_contact_summary are aggregate objects defined
-- directly in the DB. RLS can only be enabled on base TABLES, so the DO blocks
-- below guard on relkind and skip (with a NOTICE) if they are views/matviews —
-- in that case the service-role portal API remains the isolation boundary.

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can read profiles without recursing through RLS.

create or replace function auth_rep_agency() returns integer
  language sql security definer stable
as $$
  select rep_agency_code from profiles where id = auth.uid();
$$;
revoke all on function auth_rep_agency() from public;
grant execute on function auth_rep_agency() to authenticated;

create or replace function auth_is_internal() returns boolean
  language sql security definer stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and access is not null
      and access <> 'rep'
  );
$$;
revoke all on function auth_is_internal() from public;
grant execute on function auth_is_internal() to authenticated;

-- ── sales_orders_raw (base table — order-level PII) ──────────────────────────
-- Internal roles: full read. Reps: no direct read at all — they receive sales
-- figures only as agency-scoped aggregates via the portal API (service role).
alter table sales_orders_raw enable row level security;

drop policy if exists "internal read sales_orders_raw" on sales_orders_raw;
create policy "internal read sales_orders_raw" on sales_orders_raw
  for select to authenticated
  using (auth_is_internal());

-- ── customer_summary (RLS only if it is a base table) ────────────────────────
do $$
declare k char;
begin
  select relkind into k from pg_class where oid = to_regclass('public.customer_summary');
  if k in ('r', 'p') then
    execute 'alter table public.customer_summary enable row level security';
    execute 'drop policy if exists "internal read customer_summary" on public.customer_summary';
    execute $p$create policy "internal read customer_summary" on public.customer_summary
              for select to authenticated using (auth_is_internal())$p$;
    execute 'drop policy if exists "rep read own agency customer_summary" on public.customer_summary';
    execute $p$create policy "rep read own agency customer_summary" on public.customer_summary
              for select to authenticated
              using (auth_rep_agency() is not null and agency_code = auth_rep_agency()::text)$p$;
  else
    raise notice 'customer_summary relkind=% (not a base table); RLS skipped — service-role portal API is the isolation boundary.', k;
  end if;
end $$;

-- ── customer_contact_summary (RLS only if it is a base table) ────────────────
-- No agency_code column; scope reps by membership in their agency's customer set.
do $$
declare k char;
begin
  select relkind into k from pg_class where oid = to_regclass('public.customer_contact_summary');
  if k in ('r', 'p') then
    execute 'alter table public.customer_contact_summary enable row level security';
    execute 'drop policy if exists "internal read customer_contact_summary" on public.customer_contact_summary';
    execute $p$create policy "internal read customer_contact_summary" on public.customer_contact_summary
              for select to authenticated using (auth_is_internal())$p$;
    execute 'drop policy if exists "rep read own agency customer_contact_summary" on public.customer_contact_summary';
    execute $p$create policy "rep read own agency customer_contact_summary" on public.customer_contact_summary
              for select to authenticated
              using (
                auth_rep_agency() is not null
                and customerid in (
                  select customerid from customer_summary
                  where agency_code = auth_rep_agency()::text
                )
              )$p$;
  else
    raise notice 'customer_contact_summary relkind=% (not a base table); RLS skipped — service-role portal API is the isolation boundary.', k;
  end if;
end $$;
