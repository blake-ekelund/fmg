-- Migrate legacy automation triggers onto the current trigger model.
--
-- automations_v2 shipped with trigger_type in ('d2c_at_risk','wholesale_at_risk',
-- 'manual'). The UI and the cron runner later moved to ('status_change',
-- 'order_event','date','manual'), and 20260524000005 relaxed the CHECK to just
-- length(trigger_type) > 0 — so the old rows kept saving happily while becoming
-- invisible to both. An unrecognized trigger falls through every branch of
-- findTriggerCandidates() and returns zero candidates, so these automations
-- could sit "Live" and silently enroll nobody.
--
-- The two legacy types map cleanly onto status_change:
--   d2c_at_risk       → audience 'd2c',       status_target from days_inactive
--   wholesale_at_risk → audience 'wholesale', status_target from days_inactive
--
-- days_inactive is folded into status_target (>= 365 was the churned threshold,
-- anything less was at-risk) and then dropped, since the new model derives the
-- window from the target. lookback_days is KEPT — the status_change branch of
-- the runner still reads it.

update automations
set
  trigger_type = 'status_change',
  trigger_config =
    (trigger_config - 'days_inactive')
    || jsonb_build_object(
         'audience',
         case when trigger_type = 'wholesale_at_risk' then 'wholesale' else 'd2c' end,
         'status_target',
         case
           when (trigger_config ->> 'days_inactive') ~ '^[0-9]+$'
            and (trigger_config ->> 'days_inactive')::int >= 365
           then 'churned'
           else 'at_risk'
         end
       )
where trigger_type in ('d2c_at_risk', 'wholesale_at_risk');
