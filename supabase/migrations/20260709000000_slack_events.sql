-- Slack integration: event dedupe + audit log.
--
-- The Slack Events API delivers each event at-least-once (it retries on any
-- non-2xx or slow ack), so the events webhook must dedupe. We insert one row
-- per Slack event_id with a UNIQUE constraint; a duplicate delivery hits the
-- conflict and is skipped. The same row doubles as an audit trail of who asked
-- the assistant what, whether they were authorized, and what we answered.
--
-- Only the service-role client (the webhook route) ever touches this table, so
-- RLS is enabled with NO policies: anon/authenticated get no access at all,
-- while the service role bypasses RLS. This mirrors the defense-in-depth stance
-- of the portal RLS migration.

create table if not exists slack_events (
  id            uuid primary key default gen_random_uuid(),
  slack_event_id text not null,
  team_id       text,
  channel_id    text,
  slack_user_id text,
  slack_email   text,
  authorized    boolean not null default false,
  question      text,
  answer        text,
  error_text    text,
  created_at    timestamptz not null default now()
);

-- Dedupe key: one processed row per Slack event delivery.
create unique index if not exists slack_events_event_id_key
  on slack_events (slack_event_id);

-- Read path for the integrations status card (recent activity, last answer).
create index if not exists slack_events_created_at_idx
  on slack_events (created_at desc);

comment on table slack_events is
  'Dedupe + audit log for the Slack assistant. One row per Slack event_id (unique). Written only by the service-role events webhook; RLS on with no policies denies all other roles.';

alter table slack_events enable row level security;
