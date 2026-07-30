-- ── email_template_grades ────────────────────────────────────────────────────
-- AI-graded scorecards for email templates, produced on demand by the "Grade
-- emails" action on /templates (POST /api/email/templates/grade). One current
-- grade per template — the grader upserts, so re-running replaces the score
-- rather than piling up history.
--
-- `dimensions` holds the per-axis breakdown as JSON:
--   [{ key, label, score, summary, issues:[…], strengths:[…] }]
-- so the set of dimensions can grow without a schema change.
--
-- `template_updated_at` records the template's updated_at at grading time. The
-- library uses it to flag a grade as stale when the template has been edited
-- since it was last graded.
create table if not exists email_template_grades (
  template_id          uuid primary key references email_templates(id) on delete cascade,
  overall_score        int not null check (overall_score between 0 and 100),
  letter               text not null,
  summary              text,
  dimensions           jsonb not null default '[]'::jsonb,
  model                text,
  template_updated_at  timestamptz,
  graded_by            uuid,
  graded_at            timestamptz not null default now()
);

alter table email_template_grades enable row level security;

-- Reads are open to any authenticated user (same as the templates they grade).
-- Writes go through the service-role API only, which bypasses RLS.
drop policy if exists "authenticated read template grades" on email_template_grades;
create policy "authenticated read template grades" on email_template_grades
  for select using (auth.role() = 'authenticated');
