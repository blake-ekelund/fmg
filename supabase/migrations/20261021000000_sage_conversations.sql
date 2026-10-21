-- Sage conversation history: each staff member's past chats with Sage, so the
-- widget can list and reopen them and Sage can search them ("what did we
-- decide about the holiday email?").
--
-- One row per conversation; `messages` is the transcript as the widget shows it
-- ({ role, content, actions? }[]). `search_text` is a lowercased plain-text
-- copy written by the app on save, so Sage's recall tool can ilike-search
-- without casting jsonb.
--
-- Private per user, and only ever read/written by the service-role API routes
-- (/api/help/conversations, the Sage agent), which always scope by the caller's
-- user id. RLS on with NO policies: anon/authenticated get nothing directly.

create table if not exists sage_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'New conversation',
  messages    jsonb not null default '[]'::jsonb,
  search_text text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- History list: a user's chats, newest first.
create index if not exists sage_conversations_user_updated_idx
  on sage_conversations (user_id, updated_at desc);

comment on table sage_conversations is
  'Per-user Sage chat history. Written/read only by service-role API routes scoped to the caller; RLS on with no policies.';

alter table sage_conversations enable row level security;
