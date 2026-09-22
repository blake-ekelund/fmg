-- Add the 'operations' role to profiles.access.
--
-- Ecommerce operations: the day-to-day storefront + catalog + marketing
-- surface. Sees Task List, Catalog (products / inventory / variance),
-- Storefronts (all), and Marketing. Does NOT see the dashboard, the customer
-- lists, sales analysis, the email/automation sender, Team, or System.
--
-- profiles has a CHECK constraint (profiles_access_check) enumerating the
-- valid roles, so a new role has to be added here before it can be assigned.
-- The role list mirrors UserRole in components/UserContext.tsx.

alter table profiles drop constraint if exists profiles_access_check;

alter table profiles add constraint profiles_access_check
  check (access in ('owner', 'admin', 'user', 'sales', 'marketing', 'investor', 'operations', 'rep'));
