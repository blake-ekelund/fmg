-- ════════════════════════════════════════════════════════════════════
-- Catch-up script — paste the WHOLE file into the Supabase dashboard SQL
-- editor and run once.
--
-- Covers the two migrations added on 2026-07-22:
--   20260722005000_sales_reps_address.sql
--   20260722010000_automations_legacy_triggers.sql
--
-- It does NOT include 20260722000000_email_outbound_only.sql, which belongs
-- to separate in-flight work — run that one deliberately, not as a side
-- effect of this.
--
-- Every statement is idempotent: the column add uses IF NOT EXISTS, and the
-- automations update is filtered to legacy trigger types that no longer
-- exist once it has run. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1. Street address for sales reps  (20260722005000)
--
-- sales_reps carried city/state/zip but no street line, so a rep record
-- couldn't produce a mailable address for sample and catalog shipments.
-- Defaults to '' rather than NULL, matching every other text column on the
-- table so the API never has to coalesce.
--
-- NOTE: the /api/sales-reps routes already SELECT this column. Until this
-- runs, that select errors with "column does not exist", which the GET
-- handler interprets as table-not-ready — so the Rep Directory silently
-- falls back to the read-only built-in roster. Running this restores it.
-- ─────────────────────────────────────────────────────────────────────

alter table sales_reps
  add column if not exists address text not null default '';


-- ─────────────────────────────────────────────────────────────────────
-- 2. Migrate legacy automation triggers  (20260722010000)
--
-- automations_v2 shipped with trigger_type in ('d2c_at_risk',
-- 'wholesale_at_risk','manual'). The UI and the cron runner later moved to
-- ('status_change','order_event','date','manual'), and 20260524000005
-- relaxed the CHECK to just length(trigger_type) > 0 — so old rows kept
-- saving happily while becoming invisible to both. An unrecognized trigger
-- falls through every branch of findTriggerCandidates() and returns zero
-- candidates, so these automations could sit "Live" and silently enroll
-- nobody.
--
-- days_inactive folds into status_target (>= 365 was the churned
-- threshold) and is then dropped. lookback_days is KEPT — the
-- status_change branch of the runner still reads it.
--
-- Run the SELECT below first if you want to see what will change.
-- ─────────────────────────────────────────────────────────────────────

-- Preview (optional):
-- select id, name, enabled, trigger_type, trigger_config
--   from automations
--  where trigger_type in ('d2c_at_risk', 'wholesale_at_risk');

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


-- ─────────────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────────────

-- Should list 'address' among the columns:
--   select column_name from information_schema.columns
--    where table_name = 'sales_reps' order by ordinal_position;

-- Should return zero rows:
--   select id, name, trigger_type from automations
--    where trigger_type not in
--      ('status_change', 'order_event', 'date', 'manual');
