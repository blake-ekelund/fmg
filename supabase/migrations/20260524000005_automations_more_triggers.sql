-- Relax the trigger_type CHECK on automations so we can add new types
-- (after_first_order, after_last_order, scheduled_blast) without another
-- migration each time. The cron route is the authoritative gate on what's
-- actually executable.

alter table automations
  drop constraint if exists automations_trigger_type_check;

-- Permissive replacement: just make sure it's non-empty text.
alter table automations
  add constraint automations_trigger_type_check
  check (length(trigger_type) > 0);
