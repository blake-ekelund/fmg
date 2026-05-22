-- Maintain email_threads.message_count and unread_count automatically.
-- Each insert into email_messages bumps the parent thread; each update of
-- read_at flips unread_count by -1 (a message goes from unread to read).

create or replace function email_messages_after_insert() returns trigger
language plpgsql as $$
begin
  update email_threads
     set message_count = message_count + 1,
         unread_count =
           unread_count
           + case when new.direction = 'received' and new.read_at is null then 1 else 0 end,
         last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz),
                                    coalesce(new.received_at, new.sent_at, now())),
         last_direction = new.direction,
         last_preview = coalesce(new.body_preview, left(coalesce(new.body_text, new.body_html, ''), 200)),
         updated_at = now()
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_email_messages_after_insert on email_messages;
create trigger trg_email_messages_after_insert
  after insert on email_messages
  for each row execute function email_messages_after_insert();

create or replace function email_messages_after_update() returns trigger
language plpgsql as $$
begin
  if old.read_at is null and new.read_at is not null and new.direction = 'received' then
    update email_threads
       set unread_count = greatest(0, unread_count - 1),
           updated_at = now()
     where id = new.thread_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_messages_after_update on email_messages;
create trigger trg_email_messages_after_update
  after update of read_at on email_messages
  for each row execute function email_messages_after_update();

-- Backfill counts for any threads created before the trigger existed.
update email_threads t
   set message_count = sub.cnt,
       unread_count = sub.unread
  from (
    select thread_id,
           count(*)::int as cnt,
           count(*) filter (where direction = 'received' and read_at is null)::int as unread
      from email_messages
     group by thread_id
  ) sub
 where sub.thread_id = t.id;
