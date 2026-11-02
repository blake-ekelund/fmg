-- Concierge conversions: did a chat lead to the bag, and to an order?
-- ==================================================================
-- Hand-applied (see docs/integrations.md). Idempotent.
--
-- Two signals per conversation, written by the storefronts (service role):
--   * bag adds   — the shopper tapped an "add to bag" button the concierge
--                  offered (count, catalog value, first time).
--   * the order  — an order placed in the same browser visit as the chat
--                  (same chat session key), stamped once: the first order.
-- FMG's Customer Service page reads these for its conversion strip and the
-- per-ticket badges; paid vs unpaid comes from orders.payment_status.
-- ==================================================================

alter table public.support_conversations
  add column if not exists bag_adds integer not null default 0,
  add column if not exists bag_add_value numeric(10, 2) not null default 0,
  add column if not exists first_bag_add_at timestamptz,
  add column if not exists order_id uuid references public.orders (id) on delete set null,
  add column if not exists order_number bigint,
  add column if not exists order_total numeric(10, 2),
  add column if not exists ordered_at timestamptz;

-- The conversion strip scans a recent window per store.
create index if not exists support_conversations_store_created_idx
  on public.support_conversations (store, created_at desc);
