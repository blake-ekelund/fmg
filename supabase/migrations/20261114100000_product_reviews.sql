-- Product reviews from D2C customers.
--
-- Collected on each storefront's /review page (sassyandco.com/review,
-- naturalinspirations.com/review), which customers reach from a QR code on
-- the order insert (?src=insert), an email link, or an invoice link. A
-- personal link carries the order id (?o=<orders.id>): the page pre-fills
-- that order's products and the review is marked a verified purchase.
--
-- Everything lands as status 'pending'; staff approve/reject on FMG's
-- /storefronts/reviews. Nothing is published automatically — showing
-- approved reviews on product pages is a later step, and only reviews with
-- consent_feature = true may be shown.
--
-- Distinct from storefront_feedback (site/shopping-experience feedback
-- captured in the cart): these are about a product.
--
-- Service-role only: RLS on with no policies (the storefront server action
-- and FMG's API use the service role; emails are never exposed to clients).

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Matches orders.store.
  store text not null check (store in ('sassy', 'ni')),
  part text,
  product_name text,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text not null,
  -- Public name as the customer wants it shown, e.g. "Jamie R."
  display_name text not null,
  email text not null,
  order_id uuid references public.orders(id) on delete set null,
  verified boolean not null default false,
  -- Which link brought them: insert (QR) | email | invoice | null (direct).
  source text check (source in ('insert', 'email', 'invoice')),
  consent_feature boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create index if not exists product_reviews_status_created
  on public.product_reviews (status, created_at desc);
create index if not exists product_reviews_store_part
  on public.product_reviews (store, part);

alter table public.product_reviews enable row level security;
