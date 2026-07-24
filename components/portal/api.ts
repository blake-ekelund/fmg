"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

/** Bearer header from the current session — same convention as the internal app. */
async function authHeader(): Promise<Record<string, string>> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Admin preview: when the portal is opened as /portal?previewAgency=210 from
 * Team → Rep Portal Preview, forward that agency to the API as ?agencyCode=.
 * The server only honours it for owner/admin — a real rep's own agency always
 * wins — so this is a no-op for every actual portal user.
 */
function previewAgencyCode(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("previewAgency");
}

function previewParam(): string {
  const code = previewAgencyCode();
  return code ? `agencyCode=${encodeURIComponent(code)}` : "";
}

/**
 * Build an in-portal link that survives admin preview.
 *
 * The layout's tab bar appends `?previewAgency=` itself, but any other link
 * between portal pages must too: landing on /portal/customers without it means
 * portalGet sends no agencyCode, resolvePortalAgency can't resolve an agency
 * for an admin, and the page dies with "unauthorized". Reps are unaffected —
 * their agency comes from their profile — so the bug only ever shows in
 * preview, and only via links that skip this helper.
 */
export function portalHref(path: string): string {
  const code = previewAgencyCode();
  if (!code) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}previewAgency=${encodeURIComponent(code)}`;
}

/** GET a portal endpoint with the session token attached. Throws on non-2xx. */
export async function portalGet<T>(path: string): Promise<T> {
  const extra = previewParam();
  const url = extra ? `${path}${path.includes("?") ? "&" : "?"}${extra}` : path;
  const res = await fetch(url, { headers: await authHeader(), cache: "no-store" });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/* ── Shared response types ─────────────────────────────────────────────────── */

export type PortalSummary = {
  kpis: {
    customers: number;
    sales_2025: number;
    sales_2026: number;
    variance: number;
    variance_pct: number;
  };
  monthly: { month: number; sales_2025: number; sales_2026: number }[];
  topCustomers: {
    customerid: string;
    name: string;
    state: string | null;
    sales_2026: number;
    sales_2025: number;
    last_order_date: string | null;
  }[];
};

export type PortalCustomer = {
  customerid: string;
  name: string;
  bill_to_state: string | null;
  channel: string | null;
  first_order_date: string | null;
  last_order_date: string | null;
  last_order_amount: number | null;
  lifetime_orders: number | null;
  lifetime_revenue: number | null;
  sales_2023: number | null;
  sales_2024: number | null;
  sales_2025: number | null;
  sales_2026: number | null;
  /* Same-window figures (Jan 1 → today's date) for each year, so a partial
     current year can be compared against prior years fairly. Aggregated from
     raw orders — customer_summary only carries whole-year totals. */
  ytd_2023?: number;
  ytd_2024?: number;
  ytd_2025?: number;
  ytd_2026?: number;
  /** True when an estimate or in-flight order exists — forces status to active. */
  has_open_order?: boolean;
};

export type PortalContact = {
  email: string | null;
  phone: string | null;
  billto_address: string | null;
  billto_city: string | null;
  billto_state: string | null;
  billto_zip: string | null;
  shipto_address: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
};

export type PortalSalesHub = {
  kpis: {
    customers: number;
    sales_2025: number;
    sales_2026: number;
    variance: number;
    variance_pct: number | null;
    /** Accounts 6–12 months since their last order. */
    slippingCount: number;
  };
  channels: {
    channel: string;
    customers: number;
    activeCustomers: number;
    sales_2025: number;
    sales_2026: number;
    variance: number;
    variance_pct: number | null;
  }[];
  slipping: {
    customerid: string;
    name: string;
    channel: string | null;
    state: string | null;
    days_since_order: number;
    last_order_date: string | null;
    /** Last year's spend not yet repeated this year. */
    at_stake: number;
    sales_2025: number;
    sales_2026: number;
  }[];
  growing: {
    customerid: string;
    name: string;
    channel: string | null;
    sales_2025: number;
    sales_2026: number;
    variance: number;
  }[];
  declining: PortalSalesHub["growing"];
};

/**
 * Fishbowl's SOSTATUS list collapsed to what a rep needs: an estimate that
 * hasn't been committed, a live order, a finished one, or a dead one.
 */
export type OrderStage = "estimate" | "open" | "completed" | "cancelled";

export type PortalOrder = {
  id: number | null;
  num: string | null;
  customerid: string | null;
  customer_name: string | null;
  customerpo: string | null;
  stage: OrderStage;
  /** datecompleted ?? dateissued ?? datecreated — open orders have no completion date. */
  effective_date: string | null;
  datecreated: string | null;
  dateissued: string | null;
  datecompleted: string | null;
  /** Fishbowl SOSTATUS name — "Fulfilled", "Entered", "Picked", etc. */
  status: string | null;
  totalprice: number | null;
  shiptoname: string | null;
  shiptoaddress: string | null;
  shiptocity: string | null;
  shiptostate: string | null;
  shiptozip: string | null;
  /**
   * Only present when a tracking-shaped Fishbowl custom field exists. FMG's
   * synced order data carries no dedicated tracking column, so this is usually
   * null and the UI falls back to order status.
   */
  tracking: { label: string; value: string } | null;
};

export type PortalOrderItem = {
  productnum: string | null;
  description: string | null;
  qtyordered: number | null;
  qtyfulfilled: number | null;
  totalprice: number | null;
  solineitem: number | null;
};

export type PortalAsset = {
  id: string;
  title: string;
  description: string | null;
  kind: "photo" | "product";
  url: string | null;
  fileName: string | null;
};

/* ── Formatting helpers ────────────────────────────────────────────────────── */

export function usd(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Active / At risk / Churned from last order date (mirrors internal thresholds).
 *
 * `hasOpenOrder` overrides the dates entirely: a customer with a quote out or an
 * order still on the bench is a live account, however long ago their last order
 * *completed*. Without this they'd show as lapsed and get chased as such, which
 * is both wrong and a bad look in front of the customer.
 */
export function customerStatus(
  lastOrder: string | null,
  hasOpenOrder = false,
): "active" | "at_risk" | "churned" | "none" {
  if (hasOpenOrder) return "active";
  if (!lastOrder) return "none";
  const d = new Date(lastOrder).getTime();
  if (isNaN(d)) return "none";
  const days = (Date.now() - d) / 86_400_000;
  if (days <= 180) return "active";
  if (days <= 365) return "at_risk";
  return "churned";
}
