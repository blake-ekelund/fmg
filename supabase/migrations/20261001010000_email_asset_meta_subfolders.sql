-- Image Library subfolders: a folder label may now be a path up to three
-- levels deep ("sassy-holiday-2026/ads/instagram"), matching the storage
-- prefixes subfolders are created as. Was a single segment (20261001000000).

alter table public.email_asset_meta
  drop constraint if exists email_asset_meta_folder_check;

alter table public.email_asset_meta
  add constraint email_asset_meta_folder_check
    check (folder is null or folder ~ '^[^/~]+(/[^/~]+){0,2}$');
