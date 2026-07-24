-- Rep-facing news / "What's New" feed for the portal.
--
-- Short announcements reps see in the portal: new products and launches, promos,
-- press, and portal/company updates — tagged by brand (FMG / Natural Inspirations
-- / Sassy). Non-sensitive marketing content, so authenticated portal users may
-- read published rows directly; only the service role (internal tooling) writes.

create table if not exists public.portal_news (
  id           uuid primary key default gen_random_uuid(),
  brand        text not null default 'FMG',      -- 'FMG' | 'NI' | 'Sassy'
  category     text not null default 'Update',   -- New Product | Launch | Promotion | Press | Update
  title        text not null,
  summary      text,                             -- one- or two-line card blurb
  body         text,                             -- optional longer content
  image_url    text,
  link_url     text,                             -- optional: press release / product page
  published_at date not null default current_date,
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table public.portal_news is
  'Rep-facing What''s New feed: brand announcements, launches, promos, press, portal updates.';

create index if not exists portal_news_published_idx
  on public.portal_news (is_published, published_at desc);

alter table public.portal_news enable row level security;

drop policy if exists "read published portal_news" on public.portal_news;
create policy "read published portal_news" on public.portal_news
  for select to authenticated
  using (is_published = true);

-- Starter entries: honest announcements about what just shipped in the portal.
-- Replace / add your own brand news over time.
insert into public.portal_news (brand, category, title, summary, published_at)
values
  ('FMG', 'Update',
   'Track your orders end to end',
   'Every order now shows its shipment status and tracking number, right in the portal — no more calling the office to ask where something is.',
   current_date),
  ('FMG', 'Update',
   'Download an invoice for any order',
   'Open any order and hit Download invoice for a clean, print-ready PDF that matches the office copy — great for accounts that need a paper trail.',
   current_date),
  ('FMG', 'Update',
   'Say hello to the Rep Assistant',
   'Ask the assistant about your sales, customers, and orders in plain English. Look for the button in the corner of any portal page.',
   current_date)
on conflict do nothing;
