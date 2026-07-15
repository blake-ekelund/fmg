-- Sales Rep Portal: rep identity on profiles.
--
-- External sales reps log into the same Supabase project as the internal team
-- but with access='rep'. A rep account is linked to exactly one sales agency
-- (agency_code) — the clean join key that ties customers, orders, and
-- commissions together. That code is copied from the sales_reps roster at
-- invite time (see app/api/portal/invite) so login needs no per-request
-- email matching.

alter table profiles
  add column if not exists rep_agency_code  integer,
  add column if not exists rep_is_principal boolean not null default false;

comment on column profiles.rep_agency_code is
  'For access=rep accounts: the sales agency (agency_code) this rep may view. Copied from sales_reps at invite time. NULL for internal users.';
comment on column profiles.rep_is_principal is
  'Reserved for the deferred "rep-group principals see everyone" feature. Stored now, not yet used in access logic.';
