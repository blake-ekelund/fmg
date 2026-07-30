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

/** POST JSON to a portal endpoint, carrying the session token and preview agency. */
export async function portalPost<T>(path: string, body: unknown): Promise<T> {
  const extra = previewParam();
  const url = extra ? `${path}${path.includes("?") ? "&" : "?"}${extra}` : path;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Fetch a file endpoint with the session token (+ preview agency) and save it.
 * Used for authenticated downloads the browser can't do via a plain <a href>,
 * like the orders Excel export.
 */
export async function portalDownload(path: string, filename: string): Promise<void> {
  const extra = previewParam();
  const url = extra ? `${path}${path.includes("?") ? "&" : "?"}${extra}` : path;
  const res = await fetch(url, { headers: await authHeader(), cache: "no-store" });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

/** POST a JSON body to a file endpoint and save the returned file (auth + preview). */
export async function portalDownloadPost(
  path: string,
  body: unknown,
  filename: string,
): Promise<void> {
  const extra = previewParam();
  const url = extra ? `${path}${path.includes("?") ? "&" : "?"}${extra}` : path;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

/** One turn of the portal assistant conversation. */
export type ChatMessage = { role: "user" | "assistant"; content: string };

/** One product's availability, plus the rep's own trailing-12-month sales. */
export type PortalInventoryItem = {
  part: string;
  name: string;
  brand: string;
  fragrance: string | null;
  form: string | null;
  size: string | null;
  /** Product collection (e.g. everyday, love) — a filter dimension. */
  collection: string | null;
  /** Base product line title (e.g. "Bougie Babe") — a filter dimension. */
  productTitle: string | null;
  status: "in" | "low" | "out";
  onOrder: number;
  /** Units the rep's agency sold over the last 12 months (best-seller rank). */
  units12mo: number;
  /** Dollars the rep's agency sold over the last 12 months. */
  revenue12mo: number;
  /** Units per month, oldest→newest (12), for the trend sparkline. */
  monthly: number[];
  /** Plain-language busy/quiet note, or null when history is too thin. */
  seasonNote: string | null;
};

export type PortalInventory = {
  asOf: string | null;
  /** Short month labels aligned to `monthly`, oldest→newest. */
  monthLabels: string[];
  items: PortalInventoryItem[];
};

/* ── Shared response types ─────────────────────────────────────────────────── */

export type PortalSummary = {
  kpis: {
    customers: number;
    /** Account-health split of `customers`. */
    active: number;
    at_risk: number;
    churned: number;
    no_orders: number;
    sales_2025: number; // full-year 2025
    sales_2026: number; // 2026 YTD (headline)
    sales_2025_ytd: number; // 2025 through today's date
    sales_2026_ytd: number; // raw-order 2026 YTD
    variance: number; // sales_2026 − full-year 2025
    variance_pct: number;
    ytd_variance: number; // 2026 YTD − 2025 YTD
    ytd_variance_pct: number;
    pct_of_2025: number | null; // 2026 YTD as % of full-year 2025
    ytd_through: string; // e.g. "Jul 24"
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
  /** Bill-to city, merged in from customer_contact_summary (not on customer_summary). */
  bill_to_city: string | null;
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
  /** Space-joined distinct ship-to cities/states from this account's orders.
      Not displayed — feeds location search so a chain is findable by any store
      city it ships to, not just its bill-to city. */
  ship_locations?: string | null;
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
    sales_2025: number; // full-year 2025
    sales_2026: number; // 2026 YTD (headline)
    sales_2025_ytd: number; // 2025 through today's date
    variance: number; // vs full-year 2025
    variance_pct: number | null;
    ytd_variance: number; // 2026 YTD − 2025 YTD
    ytd_variance_pct: number | null;
    pct_of_2025: number | null; // 2026 YTD as % of full-year 2025
    ytd_through: string; // e.g. "Jul 24"
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
    sales_2025_ytd: number;
    ytd_variance: number;
    ytd_variance_pct: number | null;
    pct_of_2025: number | null;
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
   * Shipment tracking for this order, one entry per carton (an order can ship in
   * several cartons / shipments). Empty when nothing has shipped or no tracking
   * was recorded. Sourced from so_shipments_raw, joined by soId.
   */
  tracking: PortalTracking[];
};

export type PortalTracking = {
  trackingNum: string;
  /** Resolved carrier label ("USPS", "UPS", "FedEx"), or null if undetectable. */
  carrier: string | null;
  /** Deep link to the carrier's tracking page, or null when carrier unknown. */
  url: string | null;
  /** True once the shipment actually shipped; false = label created, not yet shipped. */
  shipped: boolean;
  dateShipped: string | null;
  shipmentNum: string | null;
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
  kind: "photo" | "product" | "brand";
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
