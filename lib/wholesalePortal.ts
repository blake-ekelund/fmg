import { createClient } from "@supabase/supabase-js";

/**
 * Server-only, service-role client for the storefront account/commerce data
 * (partner + customer accounts, orders, analytics for redek.io and
 * naturalinspirations.com).
 *
 * As of the storefront consolidation this data lives in the FMG database
 * itself — accounts are `storefront_profiles`, kept distinct from staff
 * `profiles`. The old wholesale/Sassy project has been merged in, so this
 * uses the FMG project's own service creds directly. There is no separate
 * WHOLESALE_SUPABASE_* project anymore.
 *
 * Service role on purpose: the internal team reads every application and
 * flips wholesale_status, which storefront RLS would otherwise block.
 * Never import from client components.
 */
export function wholesalePortalAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  role: "wholesale" | "retail" | "admin";
  wholesale_status: "pending" | "approved" | "denied";
  /** Assigned sales rep — free-text, entered manually by FMG staff. */
  sales_rep?: string | null;
  /** Rep group / agency for the assigned rep — free-text, entered by FMG staff. */
  rep_group?: string | null;
  /** Fishbowl customer account number (wholesale only). Free-text, set by FMG staff. */
  account_number?: string | null;
  /** Storefront the account signed up on: 'sassy' | 'ni'. Null = predates tracking. */
  signup_store?: string | null;
  created_at?: string;
};

export type PartnerStatus = PartnerProfile["wholesale_status"];
