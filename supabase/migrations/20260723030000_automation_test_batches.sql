-- Test batches: run a real cohort end to end with every email redirected to
-- one inbox, so the whole machine can be rehearsed before it touches customers.
--
-- The flag lives on the ENROLLMENT, not just the automation, so a row that was
-- created as a test always behaves as one — even if the automation's config is
-- flipped back to live while that batch is still mid-sequence.

alter table automation_enrollments
  add column if not exists is_test boolean not null default false;

-- The original `unique (automation_id, customer_type, customer_ref)` meant a
-- customer used in a test could never be enrolled for real: the test row
-- occupied their only slot, and the runner's dedup would skip them forever.
-- Widening the key with is_test lets the same customer hold one test
-- enrollment and one live enrollment, so rehearsing costs you nothing.
--
-- The constraint name is Postgres-generated and truncated, so drop by lookup
-- rather than guessing the identifier.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'automation_enrollments'::regclass
       and contype = 'u'
  loop
    execute format('alter table automation_enrollments drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists uq_automation_enrollments_member
  on automation_enrollments (automation_id, customer_type, customer_ref, is_test);

-- Cohort reporting splits test batches out from real ones.
create index if not exists idx_automation_enrollments_is_test
  on automation_enrollments (automation_id, is_test);
