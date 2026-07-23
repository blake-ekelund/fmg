-- Cohort batching for automation enrollments.
--
-- Status-change triggers enroll whoever crossed the threshold since the last
-- run, so a "Wholesale At Risk" flow trickles: one customer Monday, three
-- Tuesday, none Wednesday. That makes results impossible to read — you can
-- never say "this subject line beat that one", because no two recipients got
-- the same email under the same conditions on the same day.
--
-- With batching, eligible customers accumulate and are released together on a
-- chosen weekday as a numbered cohort ("Wholesale At Risk 1000", then 1001 the
-- following week). Each cohort is a comparable unit for testing.
--
-- cohort_number is derived at release time as max(cohort_number) + 1 for the
-- automation rather than kept as a counter on the automation row — a counter
-- can be lost to a concurrent update, and the max is authoritative.

alter table automation_enrollments
  add column if not exists cohort_label  text,
  add column if not exists cohort_number integer;

-- Cohort roll-ups are read per automation, and the release path needs
-- max(cohort_number) for one automation.
create index if not exists idx_automation_enrollments_cohort
  on automation_enrollments (automation_id, cohort_number);
