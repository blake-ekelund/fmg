-- Social posts → Meta (Facebook Pages + Instagram)
--
-- One row = one post for one brand, published to any of its Facebook Page and
-- Instagram account. Written on /marketing/social; the social-publish cron
-- (every 5 min) claims rows whose scheduled_at has passed and publishes them
-- through the Meta Graph API (lib/social/publish.ts).
--
-- The older social_media_posts / content_calendar tables are untouched; they
-- were never wired to anything that posts.

create table if not exists public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  brand         text not null check (brand in ('Sassy', 'NI')),
  platforms     text[] not null default '{}'
                check (platforms <@ array['instagram', 'facebook']::text[]),
  post_type     text not null default 'image'
                check (post_type in ('image', 'carousel', 'reel')),
  caption       text not null default '',
  -- [{ "url": "https://…", "kind": "image" | "video" }] in display order.
  media         jsonb not null default '[]'::jsonb,
  status        text not null default 'draft'
                check (status in ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed')),
  scheduled_at  timestamptz,
  -- Set while a worker owns the row; a stale claim (>10 min) is retaken.
  claimed_at    timestamptz,
  attempts      integer not null default 0,
  -- Per platform: { "instagram": { status, id, permalink, container_id, error, at }, "facebook": {…} }.
  -- A platform already 'published' here is never posted again on retry.
  results       jsonb not null default '{}'::jsonb,
  last_error    text,
  published_at  timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists social_posts_due_idx
  on public.social_posts (status, scheduled_at);

comment on table public.social_posts is
  'Social posts published to Facebook/Instagram via the Meta Graph API by the social-publish cron. See lib/social.';

-- API routes use the service role; no client policies on purpose.
alter table public.social_posts enable row level security;

-- Public bucket Meta fetches media from: Instagram-ready JPEG renders
-- (renders/<post id>/…) and uploaded reel videos (videos/…). Kept out of
-- email-assets so it doesn't clutter the Image Library. Uploads go through
-- signed upload URLs from the API, so no storage policies are needed.
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;
