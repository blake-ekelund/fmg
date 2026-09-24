-- Account-wide marketing frequency cap (lib/automations/overlap.ts).
--
-- However many automations a customer is in, they get at most
-- marketing_per_week marketing emails in any 7 days, at least
-- marketing_min_gap_days apart. Bulk blasts count toward the cap. 0 turns a
-- rule off. Until this is applied the cron uses the same defaults (3 / 2).

alter table email_settings
  add column if not exists marketing_per_week     integer not null default 3
    check (marketing_per_week between 0 and 50),
  add column if not exists marketing_min_gap_days integer not null default 2
    check (marketing_min_gap_days between 0 and 30);
