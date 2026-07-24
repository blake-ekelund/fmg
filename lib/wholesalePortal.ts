import { createClient } from "@supabase/supabase-js";

/**
 * Server-only, service-role client for the storefront account/commerce data
 * (partner + customer accounts, orders, analytics for redek.io and
 * naturalinspirations.com).
 *
 * As of the storefront consolidation this data lives in the FMG database
 * itself — accounts are `storefront_profiles`, kept distinct from staff
 * `profiles`. So this falls back to the FMG project's own service creds:
 * once the redundant WHOLESALE_SUPABASE_* vars are removed it simply points
 * here. The override is retained so the client can still be aimed at a
 * separate project during the cutover if needed.
 *
 * Service role on purpose: the internal team reads every application and
 * flips wholesale_status, which storefront RLS would otherwise block.
 * Never import from client components.
 */
export function wholesalePortalAdmin() {
  const url =
    process.env.WHOLESALE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.WHOLESALE_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Storefront wholesale account, as the storefronts' profiles table stores it. */
export type PartnerProfile = {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  tax_id: string | null;
  business_type: string | null;
  expected_monthly_volume: string | null;
  role: "wholesale" | "retail";
  wholesale_status: "pending" | "approved" | "denied";
  /** FMG-internal sales rep (first name from the FMG team roster). */
  sales_rep?: string | null;
  /** Storefront the account signed up on: 'sassy' | 'ni'. Null = predates tracking. */
  signup_store?: string | null;
  created_at?: string;
};

export type PartnerStatus = PartnerProfile["wholesale_status"];
