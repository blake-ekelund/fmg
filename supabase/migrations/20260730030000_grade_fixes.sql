-- "Fix this" on the template grader: each applied fix is recorded on the grade
-- row so the breakdown modal can mark issues as fixed and show what changed.
-- Shape: [{dimension, issue, note, fixed_at, fixed_by}]. Reset to [] whenever
-- the template is re-graded (new grade = new issue list).
alter table email_template_grades
  add column if not exists fixes jsonb not null default '[]'::jsonb;
