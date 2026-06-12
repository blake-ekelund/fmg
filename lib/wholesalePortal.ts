import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client for the WHOLESALE Supabase project — the separate
 * project that powers partner accounts on redek.io and
 * naturalinspirations.com (auth + profiles + addresses). Not this app's
 * own database.
 *
 * Service role on purpose: the internal team reads every application and
 * flips wholesale_status, which storefront RLS would otherwise block.
 * Never import from client components.
 */
export function wholesalePortalAdmin() {
  const url = process.env.WHOLESALE_SUPABASE_URL;
  const key = process.env.WHOLESALE_SUPABASE_SERVICE_ROLE_KEY;
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
