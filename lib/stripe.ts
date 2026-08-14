import Stripe from "stripe";

/**
 * Server-only Stripe client for FMG's outbound charges — specifically the
 * wholesale "charge the card on file 30 days after ship" cron.
 *
 * Sassy and NI share ONE Stripe account, so this single STRIPE_SECRET_KEY
 * charges cards that either storefront vaulted (the storefront runs the
 * SetupIntent at checkout and writes stripe_customer_id / stripe_payment_method_id
 * onto storefront_profiles; FMG reads those and charges off-session here).
 *
 * Null until STRIPE_SECRET_KEY is set, so nothing breaks before it's wired.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey ? new Stripe(secretKey) : null;

export function stripeConfigured(): boolean {
  return Boolean(secretKey);
}
