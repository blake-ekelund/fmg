-- Customer Service: "rep is typing" in the storefront chat.
--
-- While a rep types a reply (not a note) in FMG, the composer pings this
-- timestamp every few seconds. The storefront's 4s poll reads it and shows
-- the typing dots to the customer only while it's fresh (a few seconds old),
-- so it goes quiet on its own when the rep stops, sends, or closes the tab.
-- Best-effort on both sides: without this column, nothing breaks, the dots
-- just never show for a human.
alter table public.support_conversations
  add column if not exists agent_typing_at timestamptz;
