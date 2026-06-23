-- ════════════════════════════════════════════════════════════════════
-- storefront_blog_posts — public read of PUBLISHED blog posts
--
-- Run on the FMG product database (the project behind FMG_SUPABASE_URL —
-- the same one the storefront_products view lives in). Lets the
-- storefronts (redek.io / naturalinspirations.com) read blog posts that
-- were authored + published on the FMG blog-posts board, without ever
-- exposing drafts.
--
-- Idempotent (drop-then-create). Mirrors storefront_products: a
-- security_invoker=off view granted to anon, so the storefront's anon key
-- reads it past blog_posts' RLS. Only status='published' rows are exposed;
-- each storefront filters by brand ('Sassy' / 'NI') in the app.
-- ════════════════════════════════════════════════════════════════════

drop view if exists public.storefront_blog_posts;

create view public.storefront_blog_posts
with (security_invoker = off) as
  select
    id,
    brand,
    title,
    -- URL slug from the title (lowercased, non-alphanumerics → "-", trimmed).
    -- The storefront looks posts up by this; on the rare title clash, newest
    -- wins. No new column needed — derived here.
    btrim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '-', 'g'), '-') as slug,
    body,
    seo_meta,
    tags,
    hero_image_url,
    created_at,
    updated_at
  from public.blog_posts
  where status = 'published';

comment on view public.storefront_blog_posts is
  'Published blog posts for the storefronts. Drafts are hidden; the storefront filters by brand. security_invoker=off so the anon key reads it past blog_posts RLS.';

grant select on public.storefront_blog_posts to anon, authenticated;

-- Sanity check.
select count(*) as published_posts from public.storefront_blog_posts;
