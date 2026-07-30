-- ── automation_steps.send_date ───────────────────────────────────────────────
-- Pin a step to an exact calendar date instead of a relative wait.
--
-- Until now a step only had delay_days ("N days after the prior step / after
-- enrollment"). That's the right model for reactive sequences (win-back, order
-- follow-ups), but it can't express a calendar campaign — "Mother's Day Email #1
-- on May 1, Email #2 on May 8" — where each email belongs to a specific date, not
-- a relative offset.
--
-- send_date is that pin. When set, the cron runner schedules the step's send for
-- that date regardless of delay_days. When NULL (the default, and every existing
-- row), the step keeps its relative delay_days behaviour untouched. The two are
-- mutually exclusive per step; the editor writes one or the other.
alter table automation_steps
  add column if not exists send_date date;

comment on column automation_steps.send_date is
  'When set, this step fires on this exact calendar date (used by the Schedule view for date-driven campaigns). NULL = use delay_days as a relative wait.';
