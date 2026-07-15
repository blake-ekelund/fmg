-- Allow the new external sales-rep role on profiles.access.
--
-- profiles has a CHECK constraint (profiles_access_check) enumerating the valid
-- roles. It predates the rep portal, so inserting/upserting access='rep' (the
-- invite flow, and manual test accounts) fails with a check-constraint
-- violation. Recreate the constraint with the full role set including 'rep'.
--
-- The role list mirrors UserRole in components/UserContext.tsx.

alter table profiles drop constraint if exists profiles_access_check;

alter table profiles add constraint profiles_access_check
  check (access in ('owner', 'admin', 'user', 'sales', 'marketing', 'investor', 'rep'));
