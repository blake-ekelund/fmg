-- Re-file Image Library images into folders WITHOUT moving them.
--
-- An image's storage path is its public URL, and emails/blog posts embed that
-- URL (the /email-assets proxy even caches it as immutable), so a storage move
-- would break every place the image is already used. Instead the library shows
-- each image in `folder` when set, falling back to the top-level storage prefix
-- it was uploaded under. NULL = "wherever it was uploaded".
--
-- Values are top-level folder names — the same strings as the storage prefixes
-- (new folders are created as slugs), so both kinds read as one list.

alter table public.email_asset_meta
  add column if not exists folder text
    check (folder is null or folder ~ '^[^/]+$');

create index if not exists email_asset_meta_folder_idx
  on public.email_asset_meta (folder);
