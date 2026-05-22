-- Email integration (Microsoft Graph / Outlook): schema only.
-- Apply via Supabase dashboard SQL editor or `supabase db push`.
-- RLS policies live in the companion file (..._rls.sql).

create extension if not exists "pgcrypto";

-- ── user_email_accounts ──────────────────────────────────────────────────────
-- One row per portal user that has connected a Microsoft / Outlook mailbox.
-- The refresh token is stored encrypted (AES-256-GCM, key in EMAIL_TOKEN_ENC_KEY).
-- Access tokens are NOT cached here — we re-mint them on demand and let the
-- Graph SDK keep them in process memory.
create table if not exists user_email_accounts (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null unique
                                references profiles(id) on delete cascade,
  microsoft_user_id           text not null,          -- Graph "id" (oid)
  email                       text not null,          -- the connected mailbox address
  display_name                text,
  -- Encrypted refresh token. Format: base64(iv || ciphertext || authTag).
  refresh_token_encrypted     text not null,
  scopes                      text[] not null default array[]::text[],
  -- Webhook subscription for new-mail notifications. Recreated when it expires.
  subscription_id             text,
  subscription_expires_at     timestamptz,
  subscription_client_state   text,                   -- random secret for webhook auth
  status                      text not null default 'connected'
                                check (status in ('connected','needs_reconnect','disconnected')),
  last_error                  text,
  last_synced_at              timestamptz,
  connected_at                timestamptz not null default now(),
  disconnected_at             timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_user_email_accounts_status
  on user_email_accounts (status);

create index if not exists idx_user_email_accounts_subscription
  on user_email_accounts (subscription_id)
  where subscription_id is not null;

-- ── email_threads ────────────────────────────────────────────────────────────
-- A conversation between one of our users and a customer. Keyed by Graph's
-- conversationId so replies on the same thread roll up cleanly.
create table if not exists email_threads (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references user_email_accounts(id) on delete cascade,
  -- Polymorphic customer link: wholesale uses customer_summary.customerid (text),
  -- d2c uses d2c_customer_contact.person_key (text). Nullable because inbound
  -- email from an unknown sender may not match a customer.
  customer_type         text check (customer_type in ('wholesale','d2c')),
  customer_ref          text,
  customer_name         text,
  conversation_id       text not null,                -- Graph conversationId
  subject               text,
  last_message_at       timestamptz,
  last_direction        text check (last_direction in ('sent','received')),
  last_preview          text,
  message_count         integer not null default 0,
  unread_count          integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists uq_email_threads_account_conv
  on email_threads (account_id, conversation_id);

create index if not exists idx_email_threads_customer
  on email_threads (customer_type, customer_ref)
  where customer_ref is not null;

create index if not exists idx_email_threads_last_message
  on email_threads (account_id, last_message_at desc);

-- ── email_messages ───────────────────────────────────────────────────────────
-- Individual emails. We store both sent and received; direction differentiates.
-- raw_graph_json keeps the original Graph payload for debugging and any future
-- field we want to surface without a re-fetch.
create table if not exists email_messages (
  id                    uuid primary key default gen_random_uuid(),
  thread_id             uuid not null references email_threads(id) on delete cascade,
  account_id            uuid not null references user_email_accounts(id) on delete cascade,
  direction             text not null check (direction in ('sent','received')),
  graph_message_id      text not null,                -- Graph "id"
  internet_message_id   text,                         -- RFC5322 Message-ID
  conversation_id       text not null,                -- denormalized for fast lookup
  from_address          text,
  from_name             text,
  to_addresses          jsonb not null default '[]'::jsonb,   -- [{address,name}]
  cc_addresses          jsonb not null default '[]'::jsonb,
  bcc_addresses         jsonb not null default '[]'::jsonb,
  subject               text,
  body_html             text,
  body_text             text,
  body_preview          text,
  has_attachments       boolean not null default false,
  sent_at               timestamptz,                  -- when MS recorded it sent
  received_at           timestamptz,                  -- when it landed in the mailbox
  read_at               timestamptz,
  raw_graph_json        jsonb,
  created_at            timestamptz not null default now()
);

create unique index if not exists uq_email_messages_account_graph_id
  on email_messages (account_id, graph_message_id);

create index if not exists idx_email_messages_thread
  on email_messages (thread_id, coalesce(received_at, sent_at) desc);

create index if not exists idx_email_messages_conversation
  on email_messages (account_id, conversation_id);

-- ── email_send_jobs ──────────────────────────────────────────────────────────
-- Bulk-send tracking. One row per "Email Selected" submission; per-recipient
-- detail lives in email_send_job_recipients.
create table if not exists email_send_jobs (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references user_email_accounts(id) on delete cascade,
  subject_template    text not null,
  body_template       text not null,
  target_count        integer not null default 0,
  sent_count          integer not null default 0,
  failed_count        integer not null default 0,
  status              text not null default 'pending'
                        check (status in ('pending','in_progress','completed','failed','cancelled')),
  started_at          timestamptz,
  completed_at        timestamptz,
  error_summary       text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_email_send_jobs_account
  on email_send_jobs (account_id, created_at desc);

-- ── email_send_job_recipients ────────────────────────────────────────────────
-- Per-customer outcome for a bulk send.
create table if not exists email_send_job_recipients (
  id                      uuid primary key default gen_random_uuid(),
  job_id                  uuid not null references email_send_jobs(id) on delete cascade,
  customer_type           text not null check (customer_type in ('wholesale','d2c')),
  customer_ref            text not null,
  customer_email          text not null,
  customer_name           text,
  personalized_subject    text not null,
  personalized_body       text not null,
  message_id              uuid references email_messages(id) on delete set null,
  status                  text not null default 'pending'
                            check (status in ('pending','sent','failed','skipped')),
  error_text              text,
  sent_at                 timestamptz
);

create index if not exists idx_email_send_job_recipients_job
  on email_send_job_recipients (job_id);

-- ── updated_at trigger helpers ───────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_email_accounts_updated on user_email_accounts;
create trigger trg_user_email_accounts_updated
  before update on user_email_accounts
  for each row execute function set_updated_at();

drop trigger if exists trg_email_threads_updated on email_threads;
create trigger trg_email_threads_updated
  before update on email_threads
  for each row execute function set_updated_at();
