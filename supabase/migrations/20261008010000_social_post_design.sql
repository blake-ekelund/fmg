-- Designed social posts: slides + structured caption
--
-- `design` is the slide builder's source ({ slides: [...], caption: { hook,
-- body, cta, hashtags } } — lib/social/design.ts). When it is set, `caption`
-- is compiled from design.caption and `media` holds the rendered slide JPEGs
-- (social-media/slides/<post id>/…), both written by the API — the same
-- source/output split as blog_posts.blocks/body. Photo/video posts leave
-- `design` null and edit media + caption directly.

alter table public.social_posts
  add column if not exists title text not null default '',
  add column if not exists design jsonb;

comment on column public.social_posts.title is
  'Internal name for the post (shown in the list), e.g. the wizard topic. Never posted.';
comment on column public.social_posts.design is
  'Slide builder source: { slides, caption }. When set, caption + media are compiled from it.';
