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

import { SALES_ORDERS_SQL, LINE_ITEMS_SQL, INVENTORY_SQL, SHIPMENTS_SQL } from "./fishbowlQueries";

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
 * Pull the sales-orders, line-items and shipment-tracking data views in a SINGLE
 * Fishbowl session (one login / one license seat for all three). Used by the
 * sales sync. Shipments are per-carton (soId, carrier, trackingNum, dateShipped).
 */
export async function getSalesSnapshot(): Promise<{
  orders: Record<string, unknown>[];
  items: Record<string, unknown>[];
  shipments: Record<string, unknown>[];
}> {
  return withSession(async (call) => {
    const orders = await dataQueryWith(call, SALES_ORDERS_SQL);
    const items = await dataQueryWith(call, LINE_ITEMS_SQL);
    const shipments = await dataQueryWith(call, SHIPMENTS_SQL);
    return { orders, items, shipments };
  });
}

/**
 * Pull the Point B Solutions inventory-availability snapshot (the data view
 * that reproduces Blake's "Inventory Availability" report) in one Fishbowl
 * session. Used by the inventory sync. Columns: part, description, uom, onHand,
 * allocated, notAvailable, dropShip, available, onOrder, committed, shortQty.
 */
export async function getInventoryAvailability(): Promise<Record<string, unknown>[]> {
  return runDataQuery(INVENTORY_SQL);
}

/** Escape a value for interpolation into a data-query SQL string literal. */
const sqlQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type CreateEstimateResult = {
  /** Fishbowl's internal so.id for the estimate. */
  soId: number;
  /** The SO number Fishbowl assigned (SONum is sent blank → auto-numbered). */
  soNum: string;
  /** False when an SO with this Customer PO already existed (nothing imported). */
  created: boolean;
};

/**
 * Create a sales order in ESTIMATE status via Fishbowl's CSV-import endpoint
 * (POST /api/import/SalesOrderDetails — the REST /sales-orders endpoint is
 * read-only on this instance, it 405s on POST). `rows` is the CSV as an array
 * of arrays, header row first — build it with lib/fishbowlEstimate.ts.
 *
 * The SO number is auto-assigned by Fishbowl (rows carry a blank SONum); the
 * storefront ref (SASSY-####) travels as Customer PO, so `poNum` is the
 * identity used for dedupe and post-import lookup.
 *
 * Everything runs in ONE session (one license seat):
 *  1. The customer must already exist — the import silently CREATES unknown
 *     customer names, so we refuse rather than pollute the customer list.
 *  2. If an SO with this Customer PO already exists, returns it without
 *     importing — pushing the same order twice must not create two SOs.
 *  3. Imports, then verifies the SO actually appeared (the import endpoint
 *     returns 200 with an empty body on success).
 */
export async function createEstimate(
  poNum: string,
  customerName: string,
  rows: string[][],
): Promise<CreateEstimateResult> {
  return withSession(async (call) => {
    const customers = await dataQueryWith(
      call,
      `SELECT id, accountId FROM customer WHERE name = ${sqlQuote(customerName)} AND activeFlag = 1`,
    );
    if (customers.length === 0) {
      throw new Error(
        `Fishbowl has no active customer named "${customerName}" — the import would auto-create one, so this is blocked. Add/match the customer in Fishbowl first.`,
      );
    }

    // The import rejects blank addresses ("Address is required"), but orders
    // placed before checkout collected addresses have none. Backfill blank
    // bill-to/ship-to column groups from the customer's default address —
    // the same thing the Fishbowl client does when keying an order.
    await backfillAddresses(call, Number(customers[0].accountId), rows);

    // Match on customerPO, plus num for orders pushed before the auto-number
    // switch (their SO number IS the storefront ref).
    const findSo = () =>
      dataQueryWith(
        call,
        `SELECT id, num FROM so WHERE customerPO = ${sqlQuote(poNum)} OR num = ${sqlQuote(poNum)} ORDER BY id DESC`,
      );

    const existing = await findSo();
    if (existing.length > 0) {
      return { soId: Number(existing[0].id), soNum: String(existing[0].num), created: false };
    }

    // The import REQUIRES an SO number (verified 2026-07-31: blank SONum →
    // "Order number must be specified"), and Fishbowl's internal counter isn't
    // queryable. So auto-number the way the client effectively does: next
    // numeric so.num, bumped past any collision. Re-posting an EXISTING number
    // would append lines to that SO, so the free-number check matters.
    const header = rows[0] ?? [];
    const soCol = header.indexOf("SONum");
    if (soCol >= 0 && rows.slice(1).every((r) => !(r[soCol] ?? "").trim())) {
      const maxRows = await dataQueryWith(
        call,
        `SELECT MAX(CAST(num AS UNSIGNED)) AS maxNum FROM so WHERE num REGEXP '^[0-9]+$'`,
      );
      let next = Number(maxRows[0]?.maxNum ?? 0) + 1;
      if (!Number.isFinite(next) || next <= 1) {
        throw new Error("Could not determine the next Fishbowl SO number.");
      }
      for (;;) {
        const clash = await dataQueryWith(
          call,
          `SELECT id FROM so WHERE num = ${sqlQuote(String(next))}`,
        );
        if (clash.length === 0) break;
        next++;
      }
      for (const row of rows.slice(1)) row[soCol] = String(next);
    }

    const res = await call(`/api/import/SalesOrderDetails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let message = body.slice(0, 500);
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        /* keep raw body */
      }
      throw new Error(`Fishbowl estimate import failed (${res.status}): ${message}`);
    }

    const check = await findSo();
    if (check.length === 0) {
      throw new Error(
        `Fishbowl accepted the import but the estimate for PO ${poNum} did not appear — check the order in the Fishbowl client.`,
      );
    }
    return { soId: Number(check[0].id), soNum: String(check[0].num), created: true };
  });
}

/**
 * Fill blank BillTo/ShipTo column groups in SalesOrderDetails import rows
 * with the account's default address. Mutates `rows` in place; no-op when
 * every row already has both cities or the account has no default address.
 */
async function backfillAddresses(
  call: Caller,
  accountId: number,
  rows: string[][],
): Promise<void> {
  const header = rows[0] ?? [];
  const col = (name: string) => header.indexOf(name);
  const groups = [
    { city: col("BillToCity"), street: col("BillToAddress"), state: col("BillToState"), zip: col("BillToZip"), country: col("BillToCountry") },
    { city: col("ShipToCity"), street: col("ShipToAddress"), state: col("ShipToState"), zip: col("ShipToZip"), country: col("ShipToCountry") },
  ].filter((g) => g.city >= 0);

  const needsFill = rows
    .slice(1)
    .some((row) => groups.some((g) => !(row[g.city] ?? "").trim()));
  if (!needsFill || !Number.isFinite(accountId)) return;

  const addr = await dataQueryWith(
    call,
    `SELECT a.address AS street, a.city, s.code AS state, a.zip, c.name AS country
     FROM address a
     LEFT JOIN stateconst s ON a.stateId = s.id
     LEFT JOIN countryconst c ON a.countryId = c.id
     WHERE a.accountId = ${accountId} AND a.defaultFlag = 1
     ORDER BY a.typeID LIMIT 1`,
  );
  if (addr.length === 0) return;
  const d = addr[0] as Record<string, string | null>;

  for (const row of rows.slice(1)) {
    for (const g of groups) {
      if ((row[g.city] ?? "").trim()) continue;
      row[g.street] = String(d.street ?? "");
      row[g.city] = String(d.city ?? "");
      row[g.state] = String(d.state ?? "");
      row[g.zip] = String(d.zip ?? "");
      row[g.country] = String(d.country ?? "UNITED STATES");
    }
  }
}
