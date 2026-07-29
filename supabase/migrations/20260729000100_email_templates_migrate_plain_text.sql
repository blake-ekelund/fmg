-- Phase C, step 2 of 3 — APPLY IN LOCKSTEP WITH THE CODE CUTOVER.
--
-- ⚠️  DO NOT push this until the app change is ready to deploy — the one that
--     (a) reads & writes plain-text templates from `email_templates`
--     (source='text') instead of `user_email_templates`, and (b) resolves
--     automation steps against `email_templates`. Once the FK below is
--     repointed, a template written ONLY to user_email_templates (by a
--     not-yet-cutover code path) can no longer be attached to an automation
--     step. Step 1 is safe to run ahead of this; this one is the coupled step.
--
-- Design — the same-id copy:
--   Each user_email_templates row is copied into email_templates REUSING ITS
--   UUID. That is the whole trick: automation_steps.template_id already equals
--   these UUIDs, so the FK can be repointed with NO value remapping, and both
--   the old code (still joining user_email_templates, which survives until
--   step 3) and the new code (joining email_templates) resolve the same row
--   through the transition window. UUID collision with an existing
--   email_templates id is astronomically unlikely and, if it somehow occurred,
--   the ON CONFLICT below skips it rather than clobbering a designed template.
--
-- Idempotent: re-running copies nothing new (ON CONFLICT DO NOTHING) and the
-- repoint is a no-op once the FK already targets email_templates.

-- ── 1) Copy plain-text templates into the unified table (same id) ────────────
insert into email_templates (
  id, name, subject, type, brand, channel, status, source,
  blocks, raw_html, sms_body, preview_text, from_name, reply_to,
  text_body, last_used_at, created_by, created_at, updated_at
)
select
  u.id,
  u.name,
  u.subject,
  'email',        -- type: plain-text snippets are email bodies
  'both',         -- brand: not brand-specific
  'both',         -- channel: usable for wholesale or D2C
  'active',       -- status: these are live, in-use templates (not drafts)
  'text',         -- source discriminator
  '[]'::jsonb,    -- blocks: unused for text
  null,           -- raw_html: unused for text
  null,           -- sms_body
  null,           -- preview_text
  null,           -- from_name
  null,           -- reply_to
  u.body,         -- text_body ← the plain-text body, merge fields intact
  u.last_used_at,
  u.user_id,      -- created_by: preserve attribution
  u.created_at,
  u.updated_at
from user_email_templates u
on conflict (id) do nothing;

-- ── 2) Repoint automation_steps.template_id → email_templates, defensively ───
do $$
declare
  orphan_count integer;
  cname        text;
begin
  -- Guard: refuse to repoint if any step would be left dangling. After step 1
  -- every referenced id must now exist in email_templates; if not, something is
  -- wrong (copy skipped, manual edit, etc.) and we abort rather than orphan.
  select count(*) into orphan_count
  from automation_steps s
  where not exists (select 1 from email_templates e where e.id = s.template_id);

  if orphan_count > 0 then
    raise exception
      'Aborting FK repoint: % automation_steps row(s) reference a template_id with no email_templates match. Run step 1 (copy) first, or investigate the missing ids.',
      orphan_count;
  end if;

  -- Drop the current FK on template_id. Found by column (not by assumed name)
  -- so a non-default constraint name still resolves.
  select con.conname into cname
  from pg_constraint con
  where con.conrelid = 'automation_steps'::regclass
    and con.contype  = 'f'
    and con.conkey   = array[
      (select attnum from pg_attribute
        where attrelid = 'automation_steps'::regclass and attname = 'template_id')
    ];

  if cname is not null then
    execute format('alter table automation_steps drop constraint %I', cname);
  end if;

  -- Point it at the unified table. Keep ON DELETE RESTRICT so a template an
  -- automation depends on still can't be hard-deleted out from under it.
  alter table automation_steps
    add constraint automation_steps_template_id_fkey
    foreign key (template_id) references email_templates(id) on delete restrict;
end $$;
