-- One ticket per conversation, not one ticket per browser forever.
--
-- The first cut keyed a conversation uniquely on (store, session_key), so a
-- shopper's browser session mapped to exactly one row for its whole life. That
-- gives continuity, which is right, but it has no end: someone who leaves a tab
-- open for a week comes back to the same thread, and an agent opens a ticket
-- carrying a hundred messages across a dozen unrelated errands. Worse, a thread
-- an agent had already closed would silently reopen on the shopper's next
-- question, so "closed" never meant closed.
--
-- So session_key stops being unique. The storefront now reuses the most recent
-- thread for a session only while it is still live — recently active, not
-- closed, and under a message cap — and otherwise opens a fresh one. Same
-- shopper, same browser, new ticket. Continuity within an errand, a clean
-- boundary between errands.
--
-- Existing rows are untouched: they keep their history and simply become the
-- newest thread for their session.

drop index if exists support_conversations_session_idx;

-- The lookup the storefront does on every message: newest thread for this
-- session. Descending so the answer is the first row of the index.
create index if not exists support_conversations_session_lookup
  on public.support_conversations (store, session_key, last_message_at desc);
