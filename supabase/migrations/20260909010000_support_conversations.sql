-- Customer Service: storefront chat conversations, and two-way replies.
--
-- Until now the "ask sassy" concierge on the storefront was a black box. It
-- talked to customers all day and left nothing behind: no transcript, no
-- record of which tools it ran, no way to see what it told anyone. These two
-- tables are the record, and they are also the channel — an agent replying in
-- the FMG portal writes a row here, and the storefront widget picks it up on
-- its next poll. One table, both directions.
--
-- Both sides reach this with the service role (the storefront's admin client
-- and FMG's supabaseServer), so RLS is on with NO policies: nothing that runs
-- with the anon key can read a stranger's conversation. Access from the portal
-- is gated by requireInternalUser on the API route, exactly like storefront
-- feedback.

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),

  -- Which storefront. Same two-brand split the orders and feedback tables use.
  store text not null check (store in ('sassy', 'ni')),

  -- Minted by the widget and kept in sessionStorage. Shoppers are mostly
  -- anonymous, so this — not an account — is what lets a thread survive a
  -- reload and lets us append to the right conversation instead of opening a
  -- new one on every message.
  session_key text not null,

  -- Set when the shopper happens to be signed in. Nullable forever: most
  -- conversations are with people who never sign in.
  profile_id uuid references public.profiles(id) on delete set null,
  email text,
  name text,

  -- Retail vs wholesale, derived server-side from the session at the time of
  -- the first message. Tells an agent which price list the bot was quoting.
  channel text not null default 'd2c' check (channel in ('d2c', 'wholesale')),

  -- bot         — the concierge is handling it, nobody needs to look
  -- needs_human — escalated (the bot gave up, or the shopper asked); in queue
  -- human       — an agent has taken it; the BOT STOPS REPLYING while here
  -- closed      — done; the bot resumes if the shopper comes back
  status text not null default 'bot'
    check (status in ('bot', 'needs_human', 'human', 'closed')),

  assigned_to uuid references public.profiles(id) on delete set null,

  -- First thing the shopper said, trimmed. Gives the inbox list a readable
  -- line without loading every message.
  subject text,

  -- Set when the conversation began by tapping one of the widget's suggested
  -- questions, holding the exact prompt text. Null means they typed their own
  -- opener. Two uses: an agent can see how someone arrived, and counting these
  -- against the total says which suggestions actually pull people in and which
  -- are taking up space. Stamped on creation only, never overwritten.
  entry_preset text,

  message_count integer not null default 0,
  last_message_at timestamptz not null default now(),

  -- True from the moment a shopper writes until an agent opens the thread.
  -- Drives the unread count in the nav.
  agent_unread boolean not null default false,

  -- Where they were standing when they opened the chat, and on what. The most
  -- useful two fields when a complaint is really a broken page.
  page_url text,
  user_agent text,

  created_at timestamptz not null default now()
);

-- One live thread per browser session per store. The storefront upserts on
-- this, so a double-submit can't fork a conversation in two.
create unique index if not exists support_conversations_session_idx
  on public.support_conversations (store, session_key);

-- The inbox reads newest-activity-first, usually filtered by status.
create index if not exists support_conversations_activity_idx
  on public.support_conversations (last_message_at desc);
create index if not exists support_conversations_status_idx
  on public.support_conversations (status, last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.support_conversations(id) on delete cascade,

  -- user      — the shopper
  -- assistant — the AI concierge
  -- agent     — a human in the FMG portal, delivered to the shopper
  -- note      — a human in the FMG portal, NEVER delivered (internal only)
  -- system    — state changes worth seeing in the transcript
  role text not null check (role in ('user', 'assistant', 'agent', 'note', 'system')),

  content text not null,

  -- Who wrote it, for 'agent' and 'note'.
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,

  -- The observability payload: which tools the bot called for this reply and
  -- what it got back. This is how you find out that a confident wrong answer
  -- came from an empty ingredients field rather than from the model.
  tools jsonb,

  created_at timestamptz not null default now(),

  -- Monotonic cursor. The storefront polls "anything after seq N" and
  -- created_at can tie at millisecond resolution when a burst lands together;
  -- this cannot. Ordering within a conversation is always by seq.
  seq bigserial not null
);

create index if not exists support_messages_thread_idx
  on public.support_messages (conversation_id, seq);

-- The storefront's poll: new deliverable messages for one conversation. Notes
-- are excluded there in the query, not here — this index just has to be cheap.
create index if not exists support_messages_seq_idx
  on public.support_messages (seq);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

-- Deliberately no policies. Service role only, from both apps.
