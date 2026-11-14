-- Customer Service: when and how a ticket was resolved, which drives the archive.
--
-- "Issue handled" (status 'closed') is no longer a permanent column on the
-- board. A ticket sits there for 12 hours after it's resolved, in case the
-- customer writes back (which reopens it), and then drops into the Archive.
-- The archive is DERIVED from resolved_at, so nothing has to run to move it.
--
-- resolved_by says who decided it was done:
--   ai    — the storefront concierge (mark_resolved tool), or the idle-chat
--           review cron judging a quiet AI chat as answered
--   agent — a person on the team (Mark handled / dragged to Issue handled)
--   auto  — the idle-chat review closed a chat the customer simply walked
--           away from without a real question outstanding
-- resolution is a one-line summary of the outcome, for the archive list.

alter table public.support_conversations
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text
    check (resolved_by in ('ai', 'agent', 'auto')),
  add column if not exists resolution text;

-- Tickets closed before this existed: treat their last activity as the
-- resolution time, so they land in the archive rather than on the board.
update public.support_conversations
  set resolved_at = last_message_at,
      resolved_by = coalesce(resolved_by, 'agent')
  where status = 'closed' and resolved_at is null;

create index if not exists support_conversations_resolved_idx
  on public.support_conversations (resolved_at desc)
  where status = 'closed';
