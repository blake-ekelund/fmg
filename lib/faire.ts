/**
 * Server-only client for the Faire External API (brand-side) — pulls the
 * brand's marketplace orders so they can join the storefront order pipeline.
 *
 * Auth: every request carries `X-FAIRE-ACCESS-TOKEN: <token>` from
 * FAIRE_ACCESS_TOKEN (issued per brand in the Faire brand portal /
 * by Faire support). Absent token → faireConfigured() false and the sync
 * cron no-ops, so this ships dark until the token lands.
 *
 * Money: Faire reports cents; helpers convert to dollars at the edge.
 * Response parsing is deliberately defensive — field presence varies by
 * account/API version, and the first dry run against the real token is
 * where the shape gets confirmed.
 */

const BASE = "https://www.faire.com/external-api/v2";

/**
 * The real access token is the LONG value (~100 chars). Faire's portal also
 * hands out an `apa_…` applicationId that's easily mistaken for the token
 * (it 401s), so accept either env name and pick whichever value actually
 * looks like an access token.
 */
function faireToken(): string | null {
  for (const name of ["FAIRE_ACCESS_TOKEN", "FAIRE_API_KEY"]) {
    const v = (process.env[name] ?? "").trim();
    if (v.length > 20 && !v.startsWith("apa_")) return v;
  }
  return null;
}

export function faireConfigured(): boolean {
  return faireToken() !== null;
}

type Rec = Record<string, unknown>;
const asRecord = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const centsToDollars = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) / 100 : 0;
};

export type FaireAddress = {
  name: string | null;
  company: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
};

export type FaireOrderItem = {
  sku: string | null;
  name: string | null;
  variant: string | null;
  quantity: number;
  /** Wholesale unit price in dollars. */
  price: number;
  /**
   * Faire ships testers as a FLAG on the regular line, never as a line of
   * their own — see lib/faireTester.ts, which turns this into a real line so
   * the tester reaches Fishbowl. One tester per flagged line, whatever the
   * line's quantity.
   */
  includesTester: boolean;
  /** Tester unit price in dollars, as Faire sent it. Never derive this. */
  testerPrice: number;
};

export type FaireOrder = {
  id: string;
  /** Human-facing order id (rides as `<display_id>-FAIRE` in Fishbowl POs). */
  displayId: string;
  state: string;
  createdAt: string | null;
  retailerName: string | null;
  address: FaireAddress | null;
  items: FaireOrderItem[];
  /** Sum of item price × qty, dollars. */
  subtotal: number;
};

async function faireRequest(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<Rec> {
  const token = faireToken();
  if (!token) throw new Error("No Faire access token configured (FAIRE_ACCESS_TOKEN / FAIRE_API_KEY).");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "X-FAIRE-ACCESS-TOKEN": token,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Faire ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return asRecord(await res.json().catch(() => ({})));
}

const faireGet = (path: string) => faireRequest("GET", path);

function parseAddress(raw: unknown): FaireAddress | null {
  const a = asRecord(raw);
  if (Object.keys(a).length === 0) return null;
  return {
    name: str(a.name) ?? ([str(a.first_name), str(a.last_name)].filter(Boolean).join(" ") || null),
    company: str(a.company_name),
    line1: str(a.address1),
    line2: str(a.address2),
    city: str(a.city),
    state: str(a.state_code) ?? str(a.state),
    postal_code: str(a.postal_code),
    country: str(a.country_code) ?? str(a.country),
    phone: str(a.phone_number),
  };
}

function parseOrder(raw: unknown): FaireOrder | null {
  const o = asRecord(raw);
  const id = str(o.id);
  if (!id) return null;
  const items: FaireOrderItem[] = asArray(o.items).map((it) => {
    const r = asRecord(it);
    return {
      sku: str(r.sku),
      name: str(r.product_name),
      variant: str(r.variant_name),
      quantity: Number(r.quantity) || 0,
      price: centsToDollars(r.price_cents),
      includesTester: r.includes_tester === true,
      testerPrice: centsToDollars(r.tester_price_cents),
    };
  });
  return {
    id,
    displayId: (str(o.display_id) ?? id).replace(/^#/, ""),
    state: str(o.state) ?? "UNKNOWN",
    createdAt: str(o.created_at),
    retailerName:
      str(asRecord(o.retailer).name) ?? str(o.retailer_name) ?? parseAddress(o.address)?.company ?? null,
    address: parseAddress(o.address),
    items,
    // Testers count toward the subtotal — they are billed, not free (zero $0
    // testers across 251 in a 90-day sample). Omitting them is what left every
    // affected order short of what Faire actually charged the retailer.
    subtotal: items.reduce(
      (s, it) => s + it.price * it.quantity + (it.includesTester ? it.testerPrice : 0),
      0,
    ),
  };
}

/** States that mean "an order still awaiting fulfillment" — the ones the
 *  upload flow exists for. PRE_TRANSIT/IN_TRANSIT are deliberately excluded:
 *  those were already handled (possibly hand-keyed into Fishbowl before this
 *  integration existed), and importing them risks double-entry. */
const IMPORTABLE_STATES = new Set(["NEW", "PROCESSING"]);

/** How far back to look. Faire serves orders OLDEST-FIRST (this account's
 *  history starts in 2019), so an unfiltered walk never reaches the present —
 *  updated_at_min keeps the walk to the recent window that can contain
 *  unfulfilled orders. */
const LOOKBACK_DAYS = 90;

/**
 * All current importable orders. Faire paginates by CURSOR (verified live
 * 2026-07-31 — `page` numbers just walk 2019-onward history; the portal's
 * open orders only surfaced via updated_at_min + cursor hops). Capped at 40
 * hops × 50 = 2,000 recently-updated orders per run.
 */
export async function getFaireOrders(): Promise<FaireOrder[]> {
  const all = await listRecentOrders();
  return all.filter((o) => IMPORTABLE_STATES.has(o.state));
}

/** Cursor-walk every order updated in the lookback window, all states. */
async function listRecentOrders(): Promise<FaireOrder[]> {
  const out: FaireOrder[] = [];
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  let params = `limit=50&updated_at_min=${encodeURIComponent(since)}`;
  for (let hop = 0; hop < 40; hop++) {
    const data = await faireGet(`/orders?${params}`);
    const raw = asArray(data.orders);
    const parsed = raw.map(parseOrder).filter((o): o is FaireOrder => o !== null);
    out.push(...parsed);
    const cursor = typeof data.cursor === "string" && data.cursor ? data.cursor : null;
    if (!cursor || raw.length === 0) break;
    params = `limit=50&cursor=${encodeURIComponent(cursor)}`;
  }
  return out;
}

/* ── Ship-confirmation back-sync ─────────────────────────────────────────── */

/** Our carrier ids → the names Faire displays to retailers. */
const FAIRE_CARRIER: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
};

export type FaireShipResult = { ok: boolean; detail: string };

/**
 * Tell Faire an order has shipped (carrier + tracking) — the API version of
 * the brand portal's "Ship orders" action. Accepts our order ref
 * ("<displayId>-FAIRE" or a bare display id), resolves it to Faire's internal
 * order id, moves a NEW order to PROCESSING first (shipping implies
 * acceptance), then posts the shipment. Faire notifies the retailer and
 * tracks the package from there.
 *
 * HARD GATE: does nothing unless env FAIRE_SHIP_SYNC="on" — marking real
 * marketplace orders shipped is customer-visible, so this stays dark until
 * Blake flips it deliberately.
 */
export async function markFaireOrderShipped(
  orderRef: string,
  carrierId: string | null,
  trackingCode: string,
): Promise<FaireShipResult> {
  if ((process.env.FAIRE_SHIP_SYNC ?? "").trim().toLowerCase() !== "on") {
    return { ok: false, detail: "FAIRE_SHIP_SYNC is not 'on' — Faire not notified (testing gate)." };
  }
  const displayId = orderRef.replace(/-FAIRE$/i, "").replace(/^#/, "").trim();
  if (!displayId || !trackingCode.trim()) {
    return { ok: false, detail: "Missing display id or tracking code." };
  }

  const recent = await listRecentOrders();
  const match = recent.find((o) => o.displayId === displayId);
  if (!match) {
    return { ok: false, detail: `Order ${displayId} not found on Faire (last ${LOOKBACK_DAYS}d).` };
  }
  if (["DELIVERED", "CANCELED", "IN_TRANSIT", "PRE_TRANSIT"].includes(match.state)) {
    return { ok: true, detail: `Order ${displayId} already ${match.state} on Faire — nothing to do.` };
  }

  if (match.state === "NEW") {
    await faireRequest("PUT", `/orders/${encodeURIComponent(match.id)}/processing`, {});
  }
  await faireRequest("POST", `/orders/${encodeURIComponent(match.id)}/shipments`, {
    shipments: [
      {
        order_id: match.id,
        carrier: FAIRE_CARRIER[carrierId ?? ""] ?? (carrierId || "Other"),
        tracking_code: trackingCode.trim(),
      },
    ],
  });
  return { ok: true, detail: `Faire order ${displayId} marked shipped (${trackingCode}).` };
}
