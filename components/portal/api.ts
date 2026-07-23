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
function previewParam(): string {
  if (typeof window === "undefined") return "";
  const code = new URLSearchParams(window.location.search).get("previewAgency");
  return code ? `agencyCode=${encodeURIComponent(code)}` : "";
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

/** Active / At risk / Churned from last order date (mirrors internal thresholds). */
export function customerStatus(lastOrder: string | null): "active" | "at_risk" | "churned" | "none" {
  if (!lastOrder) return "none";
  const d = new Date(lastOrder).getTime();
  if (isNaN(d)) return "none";
  const days = (Date.now() - d) / 86_400_000;
  if (days <= 180) return "active";
  if (days <= 365) return "at_risk";
  return "churned";
}
