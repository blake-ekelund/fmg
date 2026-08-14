-- Wholesale "card on file, charge 30 days after ship" — schema.
--
-- Split by design: the storefront (store/sassy) CAPTURES the card at wholesale
-- checkout (Stripe SetupIntent → vaulted on a Stripe Customer) and writes the
-- resulting ids + display bits onto the buyer's storefront_profiles row. FMG
-- later PUSHES the charge: a daily cron finds wholesale orders shipped ≥30 days
-- ago that are still unpaid and off-session-charges the saved card.
--
-- Card data itself never lands here — only Stripe's opaque ids (cus_…/pm_…) and
-- the safe display fields (brand, last4, exp) Stripe hands back.

-- ── Account-level saved card (reused across that account's orders) ───────────
alter table storefront_profiles add column if not exists stripe_customer_id text;
alter table storefront_profiles add column if not exists stripe_payment_method_id text;
alter table storefront_profiles add column if not exists card_brand text;
alter table storefront_profiles add column if not exists card_last4 text;
alter table storefront_profiles add column if not exists card_exp_month smallint;
alter table storefront_profiles add column if not exists card_exp_year smallint;

comment on column storefront_profiles.stripe_customer_id is
  'Stripe Customer for this wholesale account (created by the storefront at first card capture). Charges use this + stripe_payment_method_id.';
comment on column storefront_profiles.stripe_payment_method_id is
  'Default saved card (pm_…) to charge off-session. Set by the storefront setup-session webhook.';

-- ── Order-level charge stamp (idempotency for the FMG day-30 charge cron) ────
alter table orders add column if not exists charged_at timestamptz;
alter table orders add column if not exists payment_intent_id text;

comment on column orders.charged_at is
  'When FMG off-session-charged the saved card for this wholesale order (30 days after ship). Null = not yet charged; the charge cron claims on this.';
comment on column orders.payment_intent_id is
  'Stripe PaymentIntent id of the wholesale ship+30 charge, for reconciliation/refunds.';
