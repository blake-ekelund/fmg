-- Distinct-open dedupe for outbound emails.
--
-- The raw `open_count` overcounts because the recipient's mail client
-- typically re-fetches the tracking pixel multiple times: once when reading,
-- again when composing a reply (pixel is inside the quoted original), again
-- when the message lands in their Sent folder, etc. We add a second counter
-- (`distinct_open_count`) that only goes up when an open arrives from a
-- (user_agent, ip) combination we haven't seen on this message before.
--
-- Gmail's image proxy collapses to one distinct count automatically because
-- proxy fetches share the same UA and IP. Same for Apple Mail Privacy Proxy.

alter table email_messages
  add column if not exists distinct_open_count integer not null default 0;

create or replace function email_message_opens_after_insert() returns trigger
language plpgsql as $$
declare
  is_new_signature boolean;
begin
  -- A new "signature" = first time we've seen this (user_agent, ip) pair on
  -- this message. We use `is not distinct from` so NULL IPs compare equal.
  select not exists (
    select 1
      from email_message_opens
     where message_id = new.message_id
       and id <> new.id
       and coalesce(user_agent, '') = coalesce(new.user_agent, '')
       and ip is not distinct from new.ip
  ) into is_new_signature;

  update email_messages
     set open_count          = open_count + 1,
         distinct_open_count = distinct_open_count + (case when is_new_signature then 1 else 0 end),
         first_opened_at     = least(coalesce(first_opened_at, new.opened_at), new.opened_at),
         last_opened_at      = greatest(coalesce(last_opened_at, new.opened_at), new.opened_at)
   where id = new.message_id;
  return new;
end;
$$;

-- Trigger is already wired from the previous migration — no need to re-create it.

-- Backfill distinct_open_count from existing events.
update email_messages m
   set distinct_open_count = sub.cnt
  from (
    select message_id, count(*)::int as cnt
      from (
        select distinct
          message_id,
          coalesce(user_agent, '') as ua,
          ip
        from email_message_opens
      ) d
     group by message_id
  ) sub
 where sub.message_id = m.id;
