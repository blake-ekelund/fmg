-- Per-user state for the top-bar notification bell.
--
-- The bell itself shows LIVE items aggregated from existing data (the user's
-- due/overdue tasks, understock/overstock asks, recent storefront + wholesale
-- orders, and reviews awaiting moderation) — there is no notifications feed to
-- store. This table only holds the two things that are genuinely per-user:
--
--   last_seen_at   when the user last opened the bell; anything newer than this
--                  counts toward the unread badge.
--   notify_*       which of the four sources this user wants surfaced.
--
-- Read and written only through /api/notifications (service role, internal
-- staff only), so RLS is on with no policies.

create table if not exists public.user_notification_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  last_seen_at     timestamptz not null default now(),
  notify_tasks     boolean not null default true,
  notify_inventory boolean not null default true,
  notify_orders    boolean not null default true,
  notify_reviews   boolean not null default true,
  updated_at       timestamptz not null default now()
);

alter table public.user_notification_state enable row level security;

comment on table public.user_notification_state is
  'Per-user notification-bell state: last-seen time (for the unread badge) and per-source toggles. Accessed only via /api/notifications (service role).';
