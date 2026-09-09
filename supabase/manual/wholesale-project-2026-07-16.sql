-- WHOLESALE project (sassyandco.com / naturalinspirations.com), NOT the FMG
-- app database. Run this against the wholesale Supabase project.
--
-- Adds the Fishbowl customer mapping to wholesale partner accounts. Each
-- wholesale partner's storefront orders should post into Fishbowl under the
-- customer tied to their Fishbowl account number — a value we maintain by hand
-- from the FMG /storefronts/partners page (Fishbowl is the source of truth; the
-- account number/customer is created there and typed in here). Null until set.

alter table profiles
  add column if not exists fishbowl_customer text;

comment on column profiles.fishbowl_customer is
  'Fishbowl customer name/account this wholesale partner maps to. Set manually from the FMG Partners page; used to auto-enter the partner''s storefront orders as Fishbowl sales orders under the right customer.';
