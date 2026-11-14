-- Customer Service: a phone number on the ticket.
--
-- Before the storefront concierge hands a chat to a person it now collects the
-- customer's email AND phone (request_human refuses without them), so whoever
-- picks the ticket up can reach them after they close the tab. Email already
-- had a column; phone is new. Nullable: older tickets and the automatic
-- "bot ran out of rounds" handoff have none.

alter table public.support_conversations
  add column if not exists phone text;
