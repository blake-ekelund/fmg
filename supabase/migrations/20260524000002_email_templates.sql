-- Email templates: per-user saved subject/body combos for reuse in the
-- compose modal. Intentionally NOT covered by the admin override that
-- the other email tables use — templates are personal scratchpads, not
-- team data.

create extension if not exists "pgcrypto";

create table if not exists email_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  name         text not null,
  subject      text not null,
  body         text not null,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_email_templates_user_updated
  on email_templates (user_id, updated_at desc);

drop trigger if exists trg_email_templates_updated on email_templates;
create trigger trg_email_templates_updated
  before update on email_templates
  for each row execute function set_updated_at();

alter table email_templates enable row level security;

drop policy if exists "own templates" on email_templates;
create policy "own templates" on email_templates
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
