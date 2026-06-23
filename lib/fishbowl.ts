/**
 * Server-only client for the Fishbowl inventory API (the REST server at
 * fragrancemarketinggroup.myfishbowl.com:2456). Logs in with the approved
 * "FMG Storefront" integrated app, caches the session token, and
 * re-authenticates on expiry. Read-only today — pulls live part inventory.
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

// Module-scoped token cache. Warm serverless instances reuse this so we don't
// log in on every request; a 401 clears it and triggers a single re-login.
let cachedToken: string | null = null;

async function login(): Promise<string> {
  const cfg = config();
  if (!cfg) throw new Error("Fishbowl not configured.");
  const res = await fetch(`${cfg.baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      appName: APP_NAME,
      appDescription: "FMG site inventory sync",
      appId: APP_ID,
      username: cfg.username,
      password: cfg.password,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !data.token) {
    throw new Error(
      `Fishbowl login failed (${res.status}): ${data.message ?? "no token returned"}`,
    );
  }
  cachedToken = data.token;
  return cachedToken;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new Error("Fishbowl not configured.");
  const run = (token: string) =>
    fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

  let res = await run(cachedToken ?? (await login()));
  if (res.status === 401) {
    // Token expired or the server restarted — re-authenticate once.
    cachedToken = null;
    res = await run(await login());
  }
  return res;
}

/** One page of part inventory (the API defaults to pageSize 100). */
export async function getInventoryPage(
  pageNumber = 1,
  pageSize = 100,
): Promise<FishbowlInventoryPage> {
  const res = await authedFetch(
    `/api/parts/inventory?pageNumber=${pageNumber}&pageSize=${pageSize}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fishbowl inventory failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as FishbowlInventoryPage;
}

const toNum = (q: string | number) => (typeof q === "number" ? q : Number(q) || 0);

/**
 * Every part's on-hand quantity, paging through all results. Dedupes by part
 * id and stops if a page stops advancing — so a server that ignores the
 * paging params can't spin this into a loop or duplicate rows.
 */
export async function getAllInventory(): Promise<FishbowlInventoryRow[]> {
  const seen = new Set<number>();
  const out: FishbowlInventoryRow[] = [];
  const first = await getInventoryPage(1, 100);

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

  absorb(first.results);
  for (let p = 2; p <= first.totalPages; p++) {
    const page = await getInventoryPage(p, 100);
    if (page.pageNumber !== p || absorb(page.results) === 0) break;
  }
  return out;
}

/** On-hand quantity keyed by part number — handy for storefront lookups. */
export async function getInventoryByPartNumber(): Promise<Map<string, FishbowlInventoryRow>> {
  const rows = await getAllInventory();
  return new Map(rows.map((r) => [r.partNumber, r]));
}
