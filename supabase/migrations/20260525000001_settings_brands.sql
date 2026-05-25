-- /settings additions:
--   1. profiles.email_signature — per-user signature appended to portal sends.
--   2. brand_settings — company-level config per brand (NI, Sassy). Read by
--      all signed-in users so brand-aware UI can render; write-restricted to
--      owners/admins via auth_is_admin().

alter table profiles
  add column if not exists email_signature text;

create table if not exists brand_settings (
  brand          text primary key check (brand in ('NI','Sassy')),
  display_name   text,
  primary_color  text,
  sender_name    text,
  updated_at     timestamptz not null default now()
);

-- Seed default rows so the admin UI has something to render against. The
-- ON CONFLICT clause keeps this safe to re-run.
insert into brand_settings (brand, display_name) values
  ('NI',    'Natural Inspirations'),
  ('Sassy', 'Sassy')
on conflict (brand) do nothing;

alter table brand_settings enable row level security;

drop policy if exists "read brand_settings"        on brand_settings;
drop policy if exists "admin write brand_settings" on brand_settings;

create policy "read brand_settings" on brand_settings
  for select to authenticated
  using (true);

create policy "admin write brand_settings" on brand_settings
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());
