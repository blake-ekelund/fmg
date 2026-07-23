-- Let an automation step exist before its email does.
--
-- automation_steps.template_id was NOT NULL, so you could only add a step by
-- picking an already-saved template — and if none existed the editor just told
-- you to go make one, losing the sequence you were in the middle of designing.
-- Making it nullable lets a step be sketched out ("Add later") and filled in
-- once the template is written.
--
-- Safety: the editor refuses to turn an automation on while any step is still
-- missing its template, and the cron runner skips such steps defensively, so a
-- null here can never become a silent no-op send.

alter table automation_steps
  alter column template_id drop not null;
