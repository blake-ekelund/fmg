-- Share email templates across the team.
--
-- Until now, each user could only see their own user_email_templates rows.
-- The whole team is small and templates are organizational knowledge (the
-- quarterly check-in, the win-back offer, etc.), so make the table a shared
-- library — anyone authenticated can read, write, and delete any row.
-- The `user_id` column is preserved on each row for "created by" attribution
-- but no longer scopes visibility.

drop policy if exists "own user templates" on user_email_templates;

-- Read: everyone authenticated.
drop policy if exists "shared select user templates" on user_email_templates;
create policy "shared select user templates" on user_email_templates
  for select to authenticated
  using (true);

-- Insert: caller must own the user_id they set. The API path already passes
-- the auth uid; this keeps the column honest if someone hits the table from
-- a different code path with a user JWT.
drop policy if exists "shared insert user templates" on user_email_templates;
create policy "shared insert user templates" on user_email_templates
  for insert to authenticated
  with check (user_id = auth.uid());

-- Update / Delete: shared — anyone on the team can curate the library.
drop policy if exists "shared update user templates" on user_email_templates;
create policy "shared update user templates" on user_email_templates
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "shared delete user templates" on user_email_templates;
create policy "shared delete user templates" on user_email_templates
  for delete to authenticated
  using (true);
