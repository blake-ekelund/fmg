-- Per-user saved subject/body templates for the compose modal.
--
-- NOTE: there is already a separate `email_templates` table in this project
-- that stores marketing newsletter blocks. We use `user_email_templates`
-- (matching the user_email_accounts naming) so the two don't collide.
--
-- An earlier (incorrect) version of this migration attempted to add a trigger
-- + RLS policy directly to the marketing email_templates table. Those drops
-- at the top are idempotent cleanup for anyone who applied that version.

create extension if not exists "pgcrypto";

-- ── Roll back the bad earlier-version state on the marketing table ────────
drop trigger if exists trg_email_templates_updated on email_templates;
drop policy  if exists "own templates"             on email_templates;
-- Disable RLS in case the earlier version enabled it. The marketing app
-- can re-enable explicitly if it wants — leaving it enabled with no
-- policies blocks all non-service-role access, which would break that app.
alter table email_templates disable row level security;

-- ── The real per-user templates table ─────────────────────────────────────
create table if not exists user_email_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  name         text not null,
  subject      text not null,
  body         text not null,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_user_email_templates_user_updated
  on user_email_templates (user_id, updated_at desc);

drop trigger if exists trg_user_email_templates_updated on user_email_templates;
create trigger trg_user_email_templates_updated
  before update on user_email_templates
  for each row execute function set_updated_at();

alter table user_email_templates enable row level security;

drop policy if exists "own user templates" on user_email_templates;
create policy "own user templates" on user_email_templates
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
