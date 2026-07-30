-- Sidecar editorial metadata for images in the public `email-assets` bucket.
--
-- The bucket stays the source of truth for WHICH images exist; this table hangs
-- title / alt text / description and a sharing flag off each object by its
-- storage `path`. Rows are optional — an image with no row reads as untitled and
-- internal-only. Deleting an image removes both its storage object and its row
-- (done in the API; there is no FK to storage.objects to lean on).
--
-- `share_scope` is a CURATION flag, not an access control: the bucket is public,
-- so every image URL is world-readable regardless. It only decides whether an
-- image is surfaced to reps on the rep-group portal ('third_party') or kept off
-- it ('internal', the default).

create table if not exists public.email_asset_meta (
  path         text primary key,
  title        text,
  alt_text     text,
  description  text,
  share_scope  text not null default 'internal'
    check (share_scope in ('internal', 'third_party')),
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists email_asset_meta_share_scope_idx
  on public.email_asset_meta (share_scope);

alter table public.email_asset_meta enable row level security;

-- Every server path touches this table with the service role (which bypasses
-- RLS). These policies only cover direct client access and mirror the bucket's
-- own "any signed-in staff can write" posture (see 20260728010000). Reps never
-- query it directly — curated rows reach them through /api/portal/assets, which
-- runs with the service role.
drop policy if exists "email_asset_meta read"  on public.email_asset_meta;
drop policy if exists "email_asset_meta write" on public.email_asset_meta;

create policy "email_asset_meta read"
  on public.email_asset_meta for select
  to authenticated
  using (true);

create policy "email_asset_meta write"
  on public.email_asset_meta for all
  to authenticated
  using (true)
  with check (true);
