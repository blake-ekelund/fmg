-- Customer Service: photos in the storefront chat.
--
-- A shopper with a broken pump or a melted butter can now attach photos in the
-- Sassy / NI chat widget. The bot looks at them, and they land on the ticket in
-- FMG's Customer Service inbox so whoever decides the refund can see the damage
-- instead of taking it on description.
--
-- Files live in a PRIVATE bucket: these are customers' photos of their homes
-- and packages, not marketing assets. Both storefronts write with the service
-- role; FMG shows them through short-lived signed URLs. Paths are
-- `<store>/<session_key>/<uuid>.<ext>`, and the storefront only accepts a path
-- under the caller's own session prefix, so one shopper can't attach another's.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  8388608, -- 8 MB; the widget downsizes to ~1600px JPEG well under this
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- On the message the photos came with: [{ path, name, type, size }].
alter table public.support_messages
  add column if not exists attachments jsonb;

-- On the ticket, so the inbox can flag it without loading every message.
--   has_attachments  — the shopper sent at least one photo
--   refund_requested — the concierge escalated it as a refund / damaged-item
--                      request (request_human with topic 'refund')
alter table public.support_conversations
  add column if not exists has_attachments boolean not null default false,
  add column if not exists refund_requested boolean not null default false;
