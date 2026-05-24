-- Automations v3: collapse trigger types into 4 categories and move audience
-- into trigger_config (it used to be encoded in the trigger_type name for
-- at_risk; in trigger_config for the others). One way to express audience.
--
-- New categories:
--   status_change : customer becomes at_risk or churned (a transition).
--   order_event   : N days after first or last order.
--   date          : one-shot OR recurring (weekly / monthly / quarterly / annually).
--   manual        : enrolled by hand.
--
-- Also drops the (automation_id, customer_type, customer_ref) unique on
-- enrollments so recurring date triggers can re-enroll the same customer
-- once per cycle. The cron now owns dedup logic per trigger type.

-- ── Convert existing trigger_type values ─────────────────────────────────
-- d2c_at_risk -> status_change (audience d2c, status at_risk)
update automations
   set trigger_type = 'status_change',
       trigger_config = (
         (coalesce(trigger_config, '{}'::jsonb) - 'days_inactive' - 'lookback_days')
         || jsonb_build_object('audience', 'd2c', 'status_target', 'at_risk')
       )
 where trigger_type = 'd2c_at_risk';

update automations
   set trigger_type = 'status_change',
       trigger_config = (
         (coalesce(trigger_config, '{}'::jsonb) - 'days_inactive' - 'lookback_days')
         || jsonb_build_object('audience', 'wholesale', 'status_target', 'at_risk')
       )
 where trigger_type = 'wholesale_at_risk';

-- after_first_order / after_last_order -> order_event
update automations
   set trigger_type = 'order_event',
       trigger_config =
         coalesce(trigger_config, '{}'::jsonb)
         || jsonb_build_object(
              'order_event_type', 'first',
              'audience', coalesce(trigger_config->>'customer_type', 'd2c')
            )
         - 'customer_type'
 where trigger_type = 'after_first_order';

update automations
   set trigger_type = 'order_event',
       trigger_config =
         coalesce(trigger_config, '{}'::jsonb)
         || jsonb_build_object(
              'order_event_type', 'last',
              'audience', coalesce(trigger_config->>'customer_type', 'd2c')
            )
         - 'customer_type'
 where trigger_type = 'after_last_order';

-- scheduled_blast -> date (one-shot)
update automations
   set trigger_type = 'date',
       trigger_config =
         coalesce(trigger_config, '{}'::jsonb)
         || jsonb_build_object('recurring', 'none')
 where trigger_type = 'scheduled_blast';

-- manual: ensure audience is set (default d2c)
update automations
   set trigger_config = coalesce(trigger_config, '{}'::jsonb)
                       || jsonb_build_object('audience', 'd2c')
 where trigger_type = 'manual'
   and not (trigger_config ? 'audience');

-- ── Drop the unique constraint so recurring date triggers can re-enroll ─
do $$
declare
  c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'automation_enrollments'::regclass
       and contype = 'u'
  loop
    execute format('alter table automation_enrollments drop constraint %I', c);
  end loop;
end $$;

create index if not exists idx_automation_enrollments_customer
  on automation_enrollments (automation_id, customer_ref);
