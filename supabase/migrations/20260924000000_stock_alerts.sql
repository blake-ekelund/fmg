-- Back-in-stock alerts.
--
-- A shopper on the Natural Inspirations storefront leaves their email on an
-- out-of-stock product ("Alert me when it's back"); the storefront inserts a
-- row here via the service role. FMG's /api/cron/stock-alerts checks pending
-- rows against live availability (storefront_products) and emails each
-- shopper once when their product is back, stamping notified_at.
--
-- Service-role only: RLS on with no policies, so neither the anon key nor a
-- signed-in shopper can read the list of emails.

create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  part text not null,
  brand text not null default 'NI',
  -- Captured at request time so the email reads well even if the product's
  -- display name later changes.
  product_name text,
  product_url text,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

-- One pending alert per shopper per product (re-requesting is a no-op); once
-- notified, they can sign up again for the next stockout.
create unique index if not exists stock_alerts_pending_email_part
  on public.stock_alerts (lower(email), part)
  where notified_at is null;

create index if not exists stock_alerts_pending_part
  on public.stock_alerts (part)
  where notified_at is null;

alter table public.stock_alerts enable row level security;
