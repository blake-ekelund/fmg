-- ════════════════════════════════════════════════════════════════════
-- Partner/account admin fields on storefront_profiles.
--
-- The /storefronts/accounts page manages BOTH D2C (retail) and wholesale
-- accounts. FMG staff manually assign a rep + rep group to any account, and
-- record a Fishbowl account number for wholesale customers.
--
-- Additive + idempotent: only adds columns, safe to re-run. Depends on
-- storefront_profiles (created in 20260724000000_storefront_consolidation.sql,
-- which sorts earlier, so `supabase db push` applies it first).
-- ════════════════════════════════════════════════════════════════════

-- Rep group / agency for the assigned rep. Free-text, entered by FMG staff
-- (sits alongside the existing free-text sales_rep column).
alter table public.storefront_profiles
  add column if not exists rep_group text;

-- Fishbowl customer account number, for wholesale accounts that already exist
-- in Fishbowl. Free-text (Fishbowl account numbers aren't strictly numeric).
alter table public.storefront_profiles
  add column if not exists account_number text;

comment on column public.storefront_profiles.rep_group is
  'Rep group / agency for the assigned rep. Free-text, set by FMG staff on the Partners admin.';
comment on column public.storefront_profiles.account_number is
  'Fishbowl customer account number (wholesale accounts only). Free-text, set by FMG staff.';

-- Partners admin filters by role (wholesale vs retail); index the lookup.
create index if not exists storefront_profiles_role_idx
  on public.storefront_profiles (role);
