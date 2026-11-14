-- Profile photo: a hosted avatar image per staff member.
--
-- The image itself lives in the public `email-assets` storage bucket under an
-- `avatars/` prefix (same bucket the email image library uses, so no new bucket
-- or policies are needed). This column just holds its public URL. Null = fall
-- back to initials, which is what the UI showed before.
--
-- Written by the user from Settings → Profile through the browser client, the
-- same path that already updates first_name / email_signature, so the existing
-- "update own profile" RLS covers it.

alter table public.profiles add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the staff member''s profile photo (email-assets/avatars/…); null falls back to initials.';
