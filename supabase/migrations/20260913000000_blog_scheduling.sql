-- Blog scheduling: posts are written in FMG and go live on the storefronts by
-- themselves once their publish date passes.
--
-- Before this, blog_posts had a bare status column and the storefront view
-- showed only status='published'. Nothing could be queued: a post was either
-- live now or not at all, and the only way to publish was to flip the status
-- by hand at the right moment. This adds the three pieces a calendar needs:
--
--   publish_at    — when the post should go live (set by the editor)
--   published_at  — when it actually did (stamped once, never moved)
--   slug          — an explicit, editable URL slug instead of one derived
--                   from the title at read time (renaming a live post no
--                   longer changes its URL)
--
-- Two things make the "automatically" part true, and they are independent so
-- either alone is enough:
--
--   1. The storefront view exposes a scheduled post the moment publish_at is
--      in the past. The stores read the view with a 5-minute cache, so a post
--      is on the site within ~5 minutes of its time with no cron involved.
--   2. A pg_cron job (every 10 minutes) flips due rows to status='published'
--      and stamps published_at, so FMG's board agrees with the site.
--
-- Statuses in use after this migration:
--   draft         — being written, not on the site
--   scheduled     — will go live at publish_at
--   published     — on the site
--   archived      — taken down, kept for reference
--   deleted       — soft-deleted (hidden everywhere)
--   ai_draft / human_review / ready — legacy rows from the retired AI
--                   generator; the editor files them under Archived / Drafts
--
-- The daily AI generator (pg_cron job calling the generate-blog-posts edge
-- function) is unscheduled here: the team writes the drafts now. The function
-- itself stays deployed and inert.
--
-- Also: RLS was OFF on blog_posts, which meant the anon key could read every
-- unreviewed draft through PostgREST. It is on now with no policies — FMG
-- uses the service role, and the storefronts read through the
-- security_invoker=off view, so nothing that should work stops working.

alter table public.blog_posts
  add column if not exists slug text,
  add column if not exists publish_at timestamptz,
  add column if not exists published_at timestamptz;

-- The status check was written for the AI pipeline (generating → ai_draft →
-- human_review → ready → published). Widen it for the editorial calendar;
-- the old values stay valid so existing rows are untouched.
alter table public.blog_posts drop constraint if exists blog_posts_status_check;
alter table public.blog_posts add constraint blog_posts_status_check
  check (status in (
    'generating', 'ai_draft', 'human_review', 'ready',
    'draft', 'scheduled', 'published', 'archived', 'deleted'
  ));

-- New rows are drafts, not AI drafts.
alter table public.blog_posts alter column status set default 'draft';

comment on column public.blog_posts.slug is
  'URL slug on the storefront (/blog/<slug>). Set by the FMG editor; the storefront view derives one from the title when this is empty.';
comment on column public.blog_posts.publish_at is
  'When a scheduled post goes live. The storefront view shows the post once this is in the past.';
comment on column public.blog_posts.published_at is
  'When the post actually went live. Stamped once (by the editor for publish-now, by the cron for scheduled posts).';

-- Same rule the old view used to derive slugs, kept as a function so the view,
-- the backfill, and the editor default agree exactly.
create or replace function public.blog_slugify(title text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '-', 'g'), '-')
$$;

-- Backfill: the post that is already live keeps the URL it has had all along.
update public.blog_posts
   set slug = public.blog_slugify(title)
 where status = 'published' and (slug is null or slug = '');

update public.blog_posts
   set published_at = coalesce(published_at, created_at)
 where status = 'published';

-- Two live posts on one brand can never share a URL. Drafts may (the old AI
-- generator produced many near-duplicate titles), so only live and queued
-- rows are constrained.
create unique index if not exists blog_posts_live_slug_uidx
  on public.blog_posts (brand, slug)
  where status in ('scheduled', 'published');

-- The publish step. Idempotent; safe to run as often as you like.
create or replace function public.publish_due_blog_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.blog_posts
     set status = 'published',
         published_at = coalesce(published_at, publish_at),
         updated_at = now()
   where status = 'scheduled'
     and publish_at is not null
     and publish_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.publish_due_blog_posts() is
  'Flips scheduled blog posts whose publish_at has passed to published. Run by pg_cron every 10 minutes.';

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'publish-due-blog-posts') then
    perform cron.schedule(
      'publish-due-blog-posts',
      '*/10 * * * *',
      'select public.publish_due_blog_posts()'
    );
  end if;
end;
$$;

-- Retire the AI draft generator. The job was created without a name (jobid 1
-- on this project), so it is matched by the function it calls.
do $$
declare
  j record;
begin
  for j in
    select jobid from cron.job where command like '%functions/v1/generate-blog-posts%'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

-- The storefront view. Column set is a superset of the old one, so a store
-- built against the old view keeps working. Note `created_at` now carries the
-- EFFECTIVE publish date, not the row's insert time: the stores render
-- created_at as the post date and sort by it, and a post queued weeks ahead
-- must read as published on the day it went live, not the day it was drafted.
drop view if exists public.storefront_blog_posts;

create view public.storefront_blog_posts
with (security_invoker = off) as
  select
    id,
    brand,
    title,
    coalesce(nullif(slug, ''), public.blog_slugify(title)) as slug,
    body,
    seo_meta,
    tags,
    hero_image_url,
    coalesce(published_at, publish_at, created_at) as published_at,
    coalesce(published_at, publish_at, created_at) as created_at,
    updated_at
  from public.blog_posts
  where status = 'published'
     or (status = 'scheduled' and publish_at is not null and publish_at <= now());

comment on view public.storefront_blog_posts is
  'Live blog posts for the storefronts: published, plus scheduled posts whose publish_at has passed. Drafts never appear. created_at is the effective publish date. security_invoker=off so the anon key reads it past blog_posts RLS.';

grant select on public.storefront_blog_posts to anon, authenticated;

-- Close the hole: drafts are internal.
alter table public.blog_posts enable row level security;
