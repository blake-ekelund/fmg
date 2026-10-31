-- Team-editable report rules were removed: the rules Sage follows when building
-- reports are set by the business in code (lib/reports/rules.ts), not by users.
-- Drops the table 20261031010000 created (no-op if it was never applied).

drop table if exists report_rules;
