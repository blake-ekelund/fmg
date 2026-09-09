-- Archive for the Purchases page.
--
-- For source in ('faire','markettime') the FMG app is an AGENT between the
-- marketplace and Fishbowl: it carries an order in, and carries shipment facts
-- back out. Once an order is done with, its row is transport history rather
-- than something anyone works. `archived_at` takes such rows off the page
-- without destroying them — Fishbowl and the marketplace both remain the real
-- record, so nothing is lost by hiding ours.
--
-- Restore is by re-sync, not by hand: the Faire and MarketTime imports clear
-- `archived_at` on any order the marketplace still calls open. An archived but
-- still-live order therefore comes back the moment someone clicks Sync — and
-- comes back with its Fishbowl stamp intact, so the estimate sweep does not
-- push it a second time.

alter table public.orders
  add column if not exists archived_at timestamptz;

-- The page reads one side or the other every time, never a mix.
create index if not exists orders_archived_at_idx
  on public.orders (archived_at);

-- One-time clean slate (Blake, 2026-09-09). Archives every order on the page
-- as of this migration: 92 rows — 84 marketplace (82 of them already carrying
-- a Fishbowl SO, 50 already shipped) and 8 storefront. Nothing is deleted, and
-- a re-sync restores the ~20 still open on Faire/MarketTime.
--
-- Deliberately unconditional on source: Blake asked for everything on the page,
-- including the 8 storefront rows. Those are the app's own records rather than
-- agent rows, and no marketplace sync will bring them back — clear their
-- `archived_at` directly if they are ever wanted on the page again.
update public.orders
   set archived_at = now()
 where archived_at is null;
