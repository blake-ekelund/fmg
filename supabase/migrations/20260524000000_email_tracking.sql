-- Open + link tracking for outbound emails.
-- Adds counters to email_messages and event tables for forensics.

create extension if not exists "pgcrypto";

-- ── counter columns on email_messages ───────────────────────────────────────
alter table email_messages
  add column if not exists open_count       integer not null default 0,
  add column if not exists first_opened_at  timestamptz,
  add column if not exists last_opened_at   timestamptz,
  add column if not exists link_click_count integer not null default 0;

-- ── email_message_opens ─────────────────────────────────────────────────────
-- One row per pixel load. The same recipient client may fire multiple times
-- (real re-opens, or MPP pre-fetches) — we keep them all for detail.
create table if not exists email_message_opens (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references email_messages(id) on delete cascade,
  opened_at   timestamptz not null default now(),
  user_agent  text,
  ip          inet
);

create index if not exists idx_email_message_opens_msg
  on email_message_opens (message_id, opened_at desc);

create or replace function email_message_opens_after_insert() returns trigger
language plpgsql as $$
begin
  update email_messages
     set open_count       = open_count + 1,
         first_opened_at  = least(coalesce(first_opened_at, new.opened_at), new.opened_at),
         last_opened_at   = greatest(coalesce(last_opened_at, new.opened_at), new.opened_at)
   where id = new.message_id;
  return new;
end;
$$;

drop trigger if exists trg_email_message_opens_insert on email_message_opens;
create trigger trg_email_message_opens_insert
  after insert on email_message_opens
  for each row execute function email_message_opens_after_insert();

-- ── email_message_links ─────────────────────────────────────────────────────
-- One row per link found in the outbound body. We rewrite the link's href in
-- the HTML to point at /api/email/link/<id>, which logs a click and 302s
-- to original_url.
create table if not exists email_message_links (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid not null references email_messages(id) on delete cascade,
  link_index        integer not null,
  original_url      text not null,
  click_count       integer not null default 0,
  first_clicked_at  timestamptz,
  last_clicked_at   timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_email_message_links_msg
  on email_message_links (message_id, link_index);

-- ── email_message_link_clicks ───────────────────────────────────────────────
create table if not exists email_message_link_clicks (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid not null references email_message_links(id) on delete cascade,
  clicked_at  timestamptz not null default now(),
  user_agent  text,
  ip          inet
);

create index if not exists idx_email_message_link_clicks_link
  on email_message_link_clicks (link_id, clicked_at desc);

create or replace function email_link_clicks_after_insert() returns trigger
language plpgsql as $$
declare
  msg_id uuid;
begin
  update email_message_links
     set click_count       = click_count + 1,
         first_clicked_at  = least(coalesce(first_clicked_at, new.clicked_at), new.clicked_at),
         last_clicked_at   = greatest(coalesce(last_clicked_at, new.clicked_at), new.clicked_at)
   where id = new.link_id
   returning message_id into msg_id;

  if msg_id is not null then
    update email_messages
       set link_click_count = link_click_count + 1
     where id = msg_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_link_clicks_insert on email_message_link_clicks;
create trigger trg_email_link_clicks_insert
  after insert on email_message_link_clicks
  for each row execute function email_link_clicks_after_insert();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table email_message_opens         enable row level security;
alter table email_message_links         enable row level security;
alter table email_message_link_clicks   enable row level security;

drop policy if exists "own opens"   on email_message_opens;
drop policy if exists "admin opens" on email_message_opens;
create policy "own opens" on email_message_opens
  for all to authenticated
  using (
    message_id in (
      select m.id from email_messages m
      join user_email_accounts a on a.id = m.account_id
      where a.user_id = auth.uid()
    )
  )
  with check (true);
create policy "admin opens" on email_message_opens
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());

drop policy if exists "own links"   on email_message_links;
drop policy if exists "admin links" on email_message_links;
create policy "own links" on email_message_links
  for all to authenticated
  using (
    message_id in (
      select m.id from email_messages m
      join user_email_accounts a on a.id = m.account_id
      where a.user_id = auth.uid()
    )
  )
  with check (true);
create policy "admin links" on email_message_links
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());

drop policy if exists "own link clicks"   on email_message_link_clicks;
drop policy if exists "admin link clicks" on email_message_link_clicks;
create policy "own link clicks" on email_message_link_clicks
  for all to authenticated
  using (
    link_id in (
      select l.id from email_message_links l
      join email_messages m on m.id = l.message_id
      join user_email_accounts a on a.id = m.account_id
      where a.user_id = auth.uid()
    )
  )
  with check (true);
create policy "admin link clicks" on email_message_link_clicks
  for all to authenticated
  using (auth_is_admin())
  with check (auth_is_admin());
