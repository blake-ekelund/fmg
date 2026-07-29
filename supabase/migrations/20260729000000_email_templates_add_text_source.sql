-- Phase C, step 1 of 3 — SAFE TO APPLY ANY TIME (purely additive).
--
-- Prepares the designed `email_templates` table to also hold the plain-text
-- templates that currently live in `user_email_templates`, so the two template
-- systems can collapse into one. This step only widens the schema: no data
-- moves, no existing row changes, no behavior changes. The block ('blocks') and
-- uploaded-HTML ('html') paths are untouched.
--
-- A third source, 'text', joins them: a plain-text body (with {{merge_fields}})
-- held in the new `text_body` column. The send/preview renderers learn to
-- serve source='text' in the accompanying app change (types.ts + send.ts).
--
-- Parity note: `email_templates` runs with RLS disabled (access via table
-- grants), and `user_email_templates` was a shared, org-wide library — so text
-- templates landing here keep the same "everyone on the team can see/edit"
-- access they had before. No RLS work is needed.

alter table email_templates
  -- Plain-text body for source='text' rows (null for 'blocks' / 'html').
  add column if not exists text_body    text,
  -- Preserve the compose modal's "last used" ordering for migrated snippets.
  add column if not exists last_used_at timestamptz,
  -- "Created by" attribution, carried over from user_email_templates.user_id.
  add column if not exists created_by   uuid references profiles(id) on delete set null;

-- Widen the source discriminator so a 'text' row is a legal state the renderers
-- must handle. (Recreated because a CHECK can't be altered in place.)
alter table email_templates
  drop constraint if exists email_templates_source_check;
alter table email_templates
  add constraint email_templates_source_check
  check (source in ('blocks', 'html', 'text'));
