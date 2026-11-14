-- Customer Service: "has this been resolved?" + rating the rep.
--
-- A rep in FMG can ask the customer whether their issue is sorted. That
-- message is delivered like any reply but carries kind = 'resolution_check',
-- which makes the storefront chat show Yes / No buttons under it (the customer
-- can still just type). "Yes" resolves the ticket and opens a short survey
-- rating the rep who asked: 1–5 stars and an optional comment.

-- What a message is, beyond its role. Null for ordinary messages.
--   resolution_check — a rep asking "has this been resolved?"
alter table public.support_messages
  add column if not exists kind text;

-- The customer's answer and their rating, on the ticket.
--   customer_resolved — true "yes, sorted" / false "no, still need help" /
--                       null never asked or not answered
--   csat_agent_id     — the rep being rated: whoever asked the question
--   csat_rating       — 1..5 stars, set once
alter table public.support_conversations
  add column if not exists customer_resolved boolean,
  add column if not exists csat_agent_id uuid references public.profiles(id) on delete set null,
  add column if not exists csat_rating smallint check (csat_rating between 1 and 5),
  add column if not exists csat_comment text,
  add column if not exists csat_at timestamptz;

-- Rep scorecards read ratings by rep over a window.
create index if not exists support_conversations_csat_idx
  on public.support_conversations (csat_agent_id, csat_at desc)
  where csat_rating is not null;
