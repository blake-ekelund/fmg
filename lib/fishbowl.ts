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
import {
  applyQuickBooksClass,
  applyTerritory,
  nextFreeSoNumber,
  parseCustomerTerritory,
} from "./fishbowlEstimate";
import { expandKitRows, flattenKit, isMultiLevelKit, type KitEdge } from "./fishbowlKits";

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

/**
 * Run several (possibly dependent) read-only queries inside ONE Fishbowl session
 * — one login / one license seat for the whole batch. Prefer this over multiple
 * runDataQuery() calls in a single request: concurrent runDataQuery() calls each
 * open their own session and can exhaust Fishbowl's small concurrent-seat license
 * (only ~3 seats), which surfaces as intermittent login failures.
 */
export async function withFishbowl<T>(
  fn: (query: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<T>,
): Promise<T> {
  return withSession((call) => fn((sql) => dataQueryWith(call, sql)));
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

/**
 * Read the kit tree below `partNums`, following nested kits until the closure
 * is complete. Returns the edges `lib/fishbowlKits.ts` flattens.
 *
 * Two levels is all this data actually holds today (PREPACK → COMPLETE →
 * parts), but the loop doesn't assume that.
 */
async function loadKitEdges(call: Caller, partNums: string[]): Promise<KitEdge[]> {
  return loadKitClosure((sql) => dataQueryWith(call, sql), partNums);
}

/**
 * The same kit closure, over any read-only query function — so a caller that
 * already holds a session (`withFishbowl`) can read it without opening a
 * second one. The estimate push uses the private wrapper above; the order
 * checks use this.
 */
export async function loadKitClosure(
  query: (sql: string) => Promise<Record<string, unknown>[]>,
  partNums: string[],
): Promise<KitEdge[]> {
  const edges: KitEdge[] = [];
  const seen = new Set<string>();
  let frontier = [...new Set(partNums.map((p) => (p ?? "").trim()).filter(Boolean))];

  for (let depth = 0; frontier.length > 0 && depth < 10; depth++) {
    // defaultQty > 0 on BOTH the edge and the is-it-a-kit subquery, because
    // this data contains dead zero-quantity kit rows — and one outright cycle:
    // 500-02-99 (Body Butter BASE) points at retired "505-11-99.old", which
    // points back. Fishbowl ignores those itself; its export of SO 24043 shows
    // 500-02-99 as a priced leaf line, never expanded. Filtering on quantity
    // reproduces that exactly and dissolves the cycle at the source.
    const rows = await query(
      `SELECT kp.num AS kit, comp.num AS component, comp.description AS descr,
              comp.price AS price, ki.defaultQty AS qty,
              (SELECT COUNT(*) FROM kititem sub
                WHERE sub.kitProductId = comp.id AND sub.defaultQty > 0) AS childCount
         FROM product kp
         JOIN kititem ki ON ki.kitProductId = kp.id
         JOIN product comp ON ki.productId = comp.id
        WHERE kp.num IN (${frontier.map(sqlQuote).join(",")})
          AND ki.defaultQty > 0
        ORDER BY kp.num, ki.sortOrder`,
    );
    frontier.forEach((p) => seen.add(p));

    const next: string[] = [];
    for (const r of rows) {
      const isKit = Number(r.childCount ?? 0) > 0;
      edges.push({
        kit: String(r.kit),
        component: String(r.component),
        description: String(r.descr ?? ""),
        price: Number(r.price ?? 0),
        qty: Number(r.qty ?? 1),
        isKit,
      });
      if (isKit && !seen.has(String(r.component))) next.push(String(r.component));
    }
    frontier = [...new Set(next)];
  }
  return edges;
}

export type CreateEstimateResult = {
  /** Fishbowl's internal so.id for the estimate. */
  soId: number;
  /** The SO number Fishbowl assigned (SONum is sent blank → auto-numbered). */
  soNum: string;
  /** False when an SO with this Customer PO already existed (nothing imported). */
  created: boolean;
  /** The QuickBooks class the estimate booked under — the customer's own
   *  (`customer.qbClassId`), or null when the customer carries none and the
   *  fallback in the rows stood. */
  qbClass: string | null;
};

/** One product line of an estimate, as it stands AFTER kit expansion — i.e.
 *  the parts Fishbowl will actually allocate. What a preflight check sees. */
export type EstimateLine = { part: string; quantity: number };

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
  opts?: {
    /** Extra dedupe key: any SO whose customerPO CONTAINS this string counts
     *  as "already entered". Marketplace orders pass their bare display id —
     *  ops hand-keys Faire orders with PO "NJB3Z5USFJ" (no -FAIRE suffix),
     *  and a hand-keyed order must never be pushed again. */
    dedupeContains?: string;
    /**
     * Only count an exact `customerPO` hit when the SO is under THIS customer.
     *
     * For a PO that is unique by construction (a storefront ref, a Faire id,
     * a MarketTime recordID) an exact hit is proof on its own. A MarketTime
     * RETAILER PO is not: it is a number the retailer chose, and two shops can
     * pick the same one. An unscoped match there would silently stamp a real
     * order as "already entered" against someone else's SO — the order would
     * never reach Fishbowl and nothing would say so.
     *
     * The other two keys (`num`, `dedupeContains`) stay global, so an order
     * ops keyed under a slightly different customer record is still caught by
     * its recordID.
     */
    dedupeExactScopedToCustomer?: boolean;
    /**
     * Last gate before anything is written. Runs on the FULLY EXPANDED lines
     * (kits already broken down into the parts Fishbowl will allocate) and
     * only once dedupe has cleared, so it never fires for an order that is
     * already in Fishbowl. THROW to abort the push — nothing has been posted
     * and no SO number has been claimed at that point.
     *
     * The stock check (lib/orderStockCheck.ts) rides here rather than in the
     * caller because only this function knows the post-expansion parts: a
     * PREPACK like 512-03-99 does not exist at Point B at all, its thirteen
     * components do.
     */
    preflight?: (lines: EstimateLine[]) => Promise<void> | void;
  },
): Promise<CreateEstimateResult> {
  return withSession(async (call) => {
    // The customer's QuickBooks class travels with the lookup — it is what the
    // SO (and every line on it) books under, and QuickBooks reports revenue by
    // class. `qbclass` has two rows named "None"; only id 1 is in use, so
    // matching the import by name is unambiguous in practice.
    const customers = await dataQueryWith(
      call,
      `SELECT c.id, c.accountId, c.customFields, qc.name AS qbClass
         FROM customer c
         LEFT JOIN qbclass qc ON qc.id = c.qbClassId
        WHERE c.name = ${sqlQuote(customerName)} AND c.activeFlag = 1`,
    );
    if (customers.length === 0) {
      throw new Error(
        `Fishbowl has no active customer named "${customerName}" — the import would auto-create one, so this is blocked. Add/match the customer in Fishbowl first.`,
      );
    }

    // Real territory attribution. The customer record carries Territory Agency
    // / Code / Sales Rep Name, and the rows were built with house defaults
    // because estimateRowsForOrder() is pure and never saw the customer — so
    // stamp the customer's own values over them now, on the session we already
    // have open. A customer with no territory keeps the defaults.
    const territory = parseCustomerTerritory(
      customers[0].customFields as string | null,
    );
    if (territory.agency || territory.code || territory.rep) {
      // Salesman must match an existing Fishbowl username exactly or the import
      // rejects the row; each agency has its own user (sysuser "SEWARD" carries
      // territory code 200), but not every one does.
      const users = await dataQueryWith(
        call,
        `SELECT userName FROM sysuser WHERE activeFlag = 1`,
      );
      const salesmanUsers = new Set(
        users.map((u) => String(u.userName ?? "").trim().toUpperCase()).filter(Boolean),
      );
      rows = applyTerritory(rows, territory, salesmanUsers);
    }

    // The customer's own QuickBooks class, over the fallback the rows carry.
    const qbClass = String(customers[0].qbClass ?? "").trim() || null;
    if (qbClass) rows = applyQuickBooksClass(rows, qbClass);

    // Multi-level kits break the importer AFTER it has committed the lines it
    // liked, so they have to be dealt with before anything is posted — and
    // before an SO number is claimed below. We expand them ourselves rather
    // than asking Fishbowl to; see lib/fishbowlKits.ts for the shape and why
    // it costs nothing in pricing.
    const productCol = (rows[0] ?? []).indexOf("ProductNumber");
    let kitEdges: KitEdge[] = [];
    if (productCol >= 0) {
      const parts = rows.slice(1).map((r) => r[productCol] ?? "");
      kitEdges = await loadKitEdges(call, parts);
      const needsExpansion = parts.some((p) => isMultiLevelKit(p, kitEdges));
      if (needsExpansion) rows = expandKitRows(rows, kitEdges);
    }

    // The import rejects blank addresses ("Address is required"), but orders
    // placed before checkout collected addresses have none. Backfill blank
    // bill-to/ship-to column groups from the customer's default address —
    // the same thing the Fishbowl client does when keying an order.
    await backfillAddresses(call, Number(customers[0].accountId), rows);

    // Match on customerPO, plus num for orders pushed before the auto-number
    // switch (their SO number IS the storefront ref), plus the contains-key
    // for hand-keyed marketplace conventions.
    const containsClause = opts?.dedupeContains?.trim()
      ? ` OR customerPO LIKE ${sqlQuote(`%${opts.dedupeContains.trim()}%`)}`
      : "";
    const customerId = Number(customers[0].id);
    const findSo = async () => {
      const rows = await dataQueryWith(
        call,
        `SELECT id, num, customerId, customerPO FROM so
          WHERE customerPO = ${sqlQuote(poNum)} OR num = ${sqlQuote(poNum)}${containsClause}
          ORDER BY id DESC`,
      );
      if (!opts?.dedupeExactScopedToCustomer) return rows;
      // Keep a hit that matched by SO number or by the globally-unique
      // contains-key, whoever it belongs to. Drop one that matched ONLY the
      // (not-necessarily-unique) PO and sits under someone else's account.
      const contains = opts.dedupeContains?.trim().toUpperCase() ?? "";
      return rows.filter((r) => {
        if (Number(r.customerId) === customerId) return true;
        if (String(r.num ?? "") === poNum) return true;
        return !!contains && String(r.customerPO ?? "").toUpperCase().includes(contains);
      });
    };

    const existing = await findSo();
    if (existing.length > 0) {
      return {
        soId: Number(existing[0].id),
        soNum: String(existing[0].num),
        created: false,
        qbClass,
      };
    }

    // Everything above this line is a read. Everything below writes. The
    // preflight sits exactly here so an aborted push leaves Fishbowl untouched
    // — no SO number claimed, no partial import.
    if (opts?.preflight) {
      await opts.preflight(stockLines(rows, kitEdges));
    }

    // The import REQUIRES an SO number (verified 2026-07-31: blank SONum →
    // "Order number must be specified"), and Fishbowl's internal counter isn't
    // queryable. So auto-number the way the client effectively does: next
    // numeric so.num, bumped past any collision. Re-posting an EXISTING number
    // would append lines to that SO, so the free-number check matters.
    const header = rows[0] ?? [];
    const soCol = header.indexOf("SONum");
    if (soCol >= 0 && rows.slice(1).every((r) => !(r[soCol] ?? "").trim())) {
      // The baseline deliberately ignores SO numbers carrying a suffix.
      // Exactly one such number sits above the live sequence — "197504-BO"
      // from 2025-04-08 — and taking a plain MAX over leading digits would
      // read it as the high-water mark and jump the whole sequence to 197505.
      const maxRows = await dataQueryWith(
        call,
        `SELECT MAX(CAST(num AS UNSIGNED)) AS maxNum FROM so WHERE num REGEXP '^[0-9]+$'`,
      );
      const base = Number(maxRows[0]?.maxNum ?? 0);
      if (!Number.isFinite(base) || base < 1) {
        throw new Error("Could not determine the next Fishbowl SO number.");
      }

      // Suffixed numbers DO count as taken, so pull everything in the window
      // above the baseline and let nextFreeSoNumber walk past them. CAST
      // reads the leading digits, so "24702 - SHIP 11.1" arrives as 24702.
      const neighbours = await dataQueryWith(
        call,
        `SELECT num FROM so
          WHERE num REGEXP '^[0-9]'
            AND CAST(num AS UNSIGNED) BETWEEN ${base} AND ${base + 1000}`,
      );
      const next = nextFreeSoNumber(
        base,
        neighbours.map((r) => String(r.num ?? "")),
      );
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
    return { soId: Number(check[0].id), soNum: String(check[0].num), created: true, qbClass };
  });
}

/**
 * The physical parts an estimate will consume, with their quantities — the
 * list a warehouse stock check has to run against.
 *
 * Three things have to be true of it, and none are true of the raw rows:
 *
 *  - Only SALE lines (SOItemTypeID 10) count. Shipping, tax, discount and
 *    subtotal lines carry no stock at all.
 *  - A kit has to be resolved to its components. `expandKitRows` above only
 *    runs for MULTI-level kits, because Fishbowl expands single-level ones
 *    itself on import — so a single-level kit is still sitting in the rows as
 *    one sale line for a part that no warehouse holds. 511-06-99 ("Mini Body
 *    Butter Acrylic Box - Filled") is not an item at Point B; its three
 *    components are. Checking stock on the kit number would find nothing and
 *    quietly pass an order that can't be filled.
 *  - The same part can appear on several lines and must be SUMMED. A display
 *    prepack expanding to 123-00-04 ×6 alongside a loose 123-00-04 ×6 needs 12
 *    on the shelf, not 6 (see Fishbowl SO 24787).
 */
export function stockLines(rows: string[][], edges: KitEdge[]): EstimateLine[] {
  const header = rows[0] ?? [];
  const productCol = header.indexOf("ProductNumber");
  const qtyCol = header.indexOf("ProductQuantity");
  const typeCol = header.indexOf("SOItemTypeID");
  if (productCol < 0 || qtyCol < 0) return [];

  const isKit = new Set(edges.map((e) => e.kit));
  const totals = new Map<string, number>();
  const add = (part: string, qty: number) => {
    const p = part.trim();
    if (!p || !(qty > 0)) return;
    totals.set(p, (totals.get(p) ?? 0) + qty);
  };

  for (const row of rows.slice(1)) {
    // Type 80 is a kit HEADER written by our own expansion; its components are
    // already on their own type-10 rows below it, so counting it would double.
    if (typeCol >= 0 && (row[typeCol] ?? "") !== "10") continue;
    const part = (row[productCol] ?? "").trim();
    const qty = Number(row[qtyCol] ?? 0);
    if (!part || !(qty > 0)) continue;
    if (isKit.has(part)) {
      for (const line of flattenKit(part, qty, edges)) {
        if (!line.isKit) add(line.product, line.qty);
      }
    } else {
      add(part, qty);
    }
  }
  return [...totals].map(([part, quantity]) => ({ part, quantity }));
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
