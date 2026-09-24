-- Blog builder: posts can be built from blocks, like email templates.
--
--   blocks       — the builder's editable source (lib/blog/blocks.ts). When
--                  set, FMG's API compiles it to `body` on every save; the
--                  storefronts keep reading `body` through
--                  storefront_blog_posts and never see this column.
--                  NULL = a post written in the older rich-text editor.
--   audience     — who the post is for: d2c | wholesale | both
--   purpose      — why it exists (lib/blog/meta.ts BLOG_PURPOSES slug)
--   description  — the team's short note from the new-post wizard
--
-- No view change: storefront_blog_posts selects explicit columns.

alter table public.blog_posts
  add column if not exists blocks jsonb,
  add column if not exists audience text,
  add column if not exists purpose text,
  add column if not exists description text;

alter table public.blog_posts drop constraint if exists blog_posts_audience_check;
alter table public.blog_posts add constraint blog_posts_audience_check
  check (audience is null or audience in ('d2c', 'wholesale', 'both'));

comment on column public.blog_posts.blocks is
  'Blog builder source (FMG only). The API renders it into body on save; storefronts read body.';
comment on column public.blog_posts.audience is 'Who the post is for: d2c | wholesale | both.';
comment on column public.blog_posts.purpose is 'Why the post exists — a slug from lib/blog/meta.ts.';
comment on column public.blog_posts.description is 'Short internal note from the new-post wizard.';
