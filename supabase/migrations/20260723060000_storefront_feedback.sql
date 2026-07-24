-- Storefront site feedback ("how is this site treating you?") → reward code.
--
-- Collected in the cart BEFORE checkout, so the shopper has not received —
-- often not even paid for — a product yet. This is deliberately NOT a product
-- review: it is a review of the storefront itself. Did the site feel like us?
-- Did anything break? What would you change?
--
-- That framing is the whole point. A shopper mid-session is the only person
-- who can tell us the checkout felt sketchy or the filters didn't work, and
-- they're gone thirty seconds later. Product reviews can wait for delivery.
--
-- The reward is minted from an ordinary unique-code batch in
-- storefront_discounts (see 20260623000000), so the offer is whatever that
-- batch is configured to be — no new discount math anywhere.
--
-- FMG stays the source of truth: the storefront never writes this table
-- directly, it POSTs /api/storefront-feedback with STOREFRONT_NOTIFY_SECRET.

create table if not exists public.storefront_feedback (
  id uuid primary key default gen_random_uuid(),
  -- Which storefront collected it. Matches orders.store.
  store text not null default 'sassy'
    check (store in ('sassy', 'ni')),

  -- ── the questions ──────────────────────────────────────────────────
  -- 1–5: how the site was to actually use (find things, get to checkout).
  ux_rating int check (ux_rating is null or (ux_rating between 1 and 5)),
  -- Does the site read the way the brand is supposed to read? Stored as the
  -- picked adjectives plus whatever they wrote. The pick-list deliberately
  -- includes unflattering options — a list of only nice words would collect
  -- only nice words, which is worth nothing.
  personality_tags text[] not null default '{}',
  personality text,
  -- Anything broken: dead buttons, bad layout, images that never loaded.
  -- `had_issues` is the shopper's own yes/no so "no problems" is a real,
  -- countable answer rather than an empty text box we have to guess at.
  had_issues boolean,
  issues text,
  -- What they'd change or add. Usually the most actionable field here.
  recommendations text,

  -- ── who + consent ──────────────────────────────────────────────────
  name text,
  email text,
  -- Did they agree to us quoting them publicly? Nothing goes on the site
  -- without this being true — an unchecked box means internal use only.
  consent_publish boolean not null default false,

  -- ── the reward ─────────────────────────────────────────────────────
  code text,
  discount_id uuid references public.storefront_discounts(id) on delete set null,

  -- ── triage ─────────────────────────────────────────────────────────
  -- Which surface collected it ('cart').
  source text,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'actioned', 'archived')),
  -- Internal-only reaction; never shown to the shopper.
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.storefront_feedback is
  'Pre-purchase site/UX feedback collected in the storefront cart in exchange for a single-use reward code. NOT product reviews — the shopper has not received anything yet. Managed in FMG (Storefronts → Site Feedback).';
comment on column public.storefront_feedback.ux_rating is
  'How the site was to use, 1-5. Not a product rating — they have not tried the product.';
comment on column public.storefront_feedback.personality_tags is
  'Adjectives the shopper picked for how the site reads. The pick-list includes negative options on purpose.';
comment on column public.storefront_feedback.had_issues is
  'Shopper-reported "did anything break". NULL = did not answer; false = explicitly nothing broken.';
comment on column public.storefront_feedback.consent_publish is
  'True only if the shopper ticked the box allowing us to quote them. Never publish a row where this is false.';
comment on column public.storefront_feedback.code is
  'The storefront_discount_codes.code minted as the reward. One live reward per email — see the unique index below.';

create index if not exists storefront_feedback_created_idx
  on public.storefront_feedback (created_at desc);
create index if not exists storefront_feedback_store_idx
  on public.storefront_feedback (store, created_at desc);
create index if not exists storefront_feedback_code_idx
  on public.storefront_feedback (code);
-- Bug reports are the time-sensitive ones — let the portal pull them first.
create index if not exists storefront_feedback_issues_idx
  on public.storefront_feedback (store, created_at desc)
  where had_issues;

-- One reward per email per store. Without this, anyone could re-submit the
-- form and mint free codes forever. The API also checks explicitly so it can
-- return a friendly message instead of a constraint error, but the index is
-- what makes it true under concurrency.
create unique index if not exists storefront_feedback_one_per_email_idx
  on public.storefront_feedback (store, lower(email))
  where email is not null;

alter table public.storefront_feedback enable row level security;
-- No policies on purpose: only the service role (the FMG API) touches this.
-- Shoppers write through the authenticated endpoint; staff read through the
-- portal, which calls the API with an internal user's token.
