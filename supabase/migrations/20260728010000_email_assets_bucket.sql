-- Public bucket for images used inside uploaded-HTML email templates.
--
-- An HTML file exported from a design tool references its images by URL. For a
-- recipient to see them, those images must live somewhere publicly fetchable —
-- so the template editor uploads them here and drops the returned public URL
-- into the HTML. Mirrors how the media-kit bucket is made public-read for the
-- storefronts (see 20260528000000_storefront_publish.sql).

insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do update set public = true;

-- Any signed-in staff member can manage objects in this bucket; the world can
-- read them (that's the whole point — the images ship inside outbound email).
drop policy if exists "email-assets read"   on storage.objects;
drop policy if exists "email-assets write"  on storage.objects;
drop policy if exists "email-assets update" on storage.objects;
drop policy if exists "email-assets delete" on storage.objects;

create policy "email-assets read"
  on storage.objects for select
  to public
  using (bucket_id = 'email-assets');

create policy "email-assets write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'email-assets');

create policy "email-assets update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'email-assets')
  with check (bucket_id = 'email-assets');

create policy "email-assets delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'email-assets');
