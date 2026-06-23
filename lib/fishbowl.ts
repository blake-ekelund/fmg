/**
 * Server-only client for the Fishbowl inventory API (the REST server at
 * fragrancemarketinggroup.myfishbowl.com:2456). Logs in with the approved
 * "FMG Storefront" integrated app, does its work, and logs out — read-only
 * today, pulling live part inventory.
 *
 * ⚠ Concurrency: Fishbowl licenses a SMALL number of concurrent users (3 on
 * this instance). Every POST /api/login consumes a seat until POST /api/logout
 * (or an inactivity timeout) frees it. So this client opens a session, runs
 * everything inside it, and ALWAYS logs out in a finally — it never holds a
 * seat between requests. For anything that needs stock frequently (e.g. the
 * storefront), sync to Supabase on a schedule and read from there; don't call
 * this live on every page view, or concurrent visitors will exhaust the seats.
 *
 * Auth: POST /api/login with { appName, appDescription, appId, username,
 * password } → { sessionId, token, user }, then `Authorization: Bearer
 * <token>` on every call. `appId` is an integer (NOT a string `appKey`) — the
 * server derives the appKey from it. The integrated app must be approved once
 * in Fishbowl (Integrations → "Approving Integrations").
 *
 * ⚠ The Fishbowl API is plain HTTP (no TLS — :443 is a different server). Keep
 * FISHBOWL_USER a dedicated, least-privilege account, and before this runs
 * from Vercel in production, front the API with TLS (e.g. a Cloudflare Tunnel)
 * so credentials aren't sent in the clear. Never import from client components.
 */

import { SALES_ORDERS_SQL, LINE_ITEMS_SQL } from "./fishbowlQueries";

const APP_NAME = process.env.FISHBOWL_APP_NAME || "FMG Storefront";
const APP_ID = Number(process.env.FISHBOWL_APP_ID || 47821);

function config() {
  const baseUrl = (process.env.FISHBOWL_API_URL || "").replace(/\/+$/, "");
  const username = process.env.FISHBOWL_USER;
  const password = process.env.FISHBOWL_PASS;
  if (!baseUrl || !username || !password) return null;
  return { baseUrl, username, password };
}

/** True when FISHBOWL_API_URL + FISHBOWL_USER + FISHBOWL_PASS are all set. */
export function fishbowlConfigured(): boolean {
  return config() !== null;
}

export type FishbowlUom = { id: number; name: string; abbreviation: string };

export type FishbowlInventoryRow = {
  id: number;
  partNumber: string;
  /** On-hand quantity. The API returns this as a string (sometimes
   *  fractional, e.g. box UOMs) — coerced to a number here. */
  quantity: number;
  partDescription: string;
  uom: FishbowlUom;
};

type RawRow = Omit<FishbowlInventoryRow, "quantity"> & { quantity: string | number };

export type FishbowlInventoryPage = {
  totalCount: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
  results: RawRow[];
};

type Caller = (path: string, init?: RequestInit) => Promise<Response>;

async function login(baseUrl: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      appName: APP_NAME,
      appDescription: "FMG site inventory sync",
      appId: APP_ID,
      username,
      password,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !data.token) {
    throw new Error(
      `Fishbowl login failed (${res.status}): ${data.message ?? "no token returned"}`,
    );
  }
  return data.token;
}

async function logout(baseUrl: string, token: string): Promise<void> {
  // Best-effort: release the license seat. If it fails, Fishbowl's inactivity
  // timeout reclaims it eventually — never let logout errors mask real work.
  try {
    await fetch(`${baseUrl}/api/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }
}

/**
 * Open a Fishbowl session, run `fn` with an authenticated caller, then always
 * log out (releasing the license seat) — even if `fn` throws.
 */
async function withSession<T>(fn: (call: Caller) => Promise<T>): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("Fishbowl not configured.");
  const token = await login(cfg.baseUrl, cfg.username, cfg.password);
  const call: Caller = (path, init = {}) =>
    fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  try {
    return await fn(call);
  } finally {
    await logout(cfg.baseUrl, token);
  }
}

async function fetchInventoryPage(
  call: Caller,
  pageNumber: number,
  pageSize: number,
): Promise<FishbowlInventoryPage> {
  const res = await call(`/api/parts/inventory?pageNumber=${pageNumber}&pageSize=${pageSize}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fishbowl inventory failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as FishbowlInventoryPage;
}

const toNum = (q: string | number) => (typeof q === "number" ? q : Number(q) || 0);

/** One page of part inventory (the API defaults to pageSize 100). */
export async function getInventoryPage(
  pageNumber = 1,
  pageSize = 100,
): Promise<FishbowlInventoryPage> {
  return withSession((call) => fetchInventoryPage(call, pageNumber, pageSize));
}

/**
 * Every part's on-hand quantity, paging through all results in ONE session.
 * Dedupes by part id and stops if a page stops advancing — so a server that
 * ignores the paging params can't spin this into a loop or duplicate rows.
 */
export async function getAllInventory(): Promise<FishbowlInventoryRow[]> {
  return withSession(async (call) => {
    const seen = new Set<number>();
    const out: FishbowlInventoryRow[] = [];
    const absorb = (rows: RawRow[]): number => {
      let added = 0;
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ ...r, quantity: toNum(r.quantity) });
        added++;
      }
      return added;
    };

    const first = await fetchInventoryPage(call, 1, 100);
    absorb(first.results);
    for (let p = 2; p <= first.totalPages; p++) {
      const page = await fetchInventoryPage(call, p, 100);
      if (page.pageNumber !== p || absorb(page.results) === 0) break;
    }
    return out;
  });
}

/** On-hand quantity keyed by part number — handy for storefront lookups. */
export async function getInventoryByPartNumber(): Promise<Map<string, FishbowlInventoryRow>> {
  const rows = await getAllInventory();
  return new Map(rows.map((r) => [r.partNumber, r]));
}

/**
 * Run a read-only SQL query against the Fishbowl database via /api/data-query
 * and return the rows as plain objects (columns depend on the SELECT). This is
 * how Fishbowl "data views" / saved Custom Queries are reached over the API.
 *
 * ⚠ The SQL must be server-controlled — NEVER pass untrusted/user input here.
 * Fishbowl runs it directly against its database.
 */
export async function runDataQuery(sql: string): Promise<Record<string, unknown>[]> {
  return withSession((call) => dataQueryWith(call, sql));
}

async function dataQueryWith(call: Caller, sql: string): Promise<Record<string, unknown>[]> {
  // The param form (?query=) avoids GET-with-body, which Node's fetch rejects.
  const res = await call(`/api/data-query?query=${encodeURIComponent(sql)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fishbowl data-query failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/**
 * Pull the sales-orders and line-items data views in a SINGLE Fishbowl session
 * (one login / one license seat for both pulls). Used by the sales sync.
 */
export async function getSalesSnapshot(): Promise<{
  orders: Record<string, unknown>[];
  items: Record<string, unknown>[];
}> {
  return withSession(async (call) => {
    const orders = await dataQueryWith(call, SALES_ORDERS_SQL);
    const items = await dataQueryWith(call, LINE_ITEMS_SQL);
    return { orders, items };
  });
}
