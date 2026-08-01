/**
 * Server-only client for the MarketTime External API — the second marketplace
 * source (after Faire) that flows into the storefront order pipeline. Mapped
 * from MarketTime's published OpenAPI spec (publicapi.markettime.com/v3/api-docs).
 *
 * Auth: header `x-api-key: <MARKETTIME_API_KEY>`. Endpoints are scoped by a
 * "Who Am I" path segment — our Repgroup ID (R123) or Manufacturer ID (M123),
 * stored as MARKETTIME_WHO_AM_I.
 *
 * Endpoints used:
 *   POST /mtpublic/api/v1/{whoAmI}/orders/get         list orders (paginated)
 *   POST /mtpublic/api/v1/{whoAmI}/orders/{id}/trackingdetails   ship-back-sync
 *
 * Ships dark: markettimeConfigured() is false until both env vars are set.
 */

const BASE = "https://publicapi.markettime.com";

function apiKey(): string | null {
  const k = (process.env.MARKETTIME_API_KEY ?? "").trim();
  return k.length > 3 ? k : null;
}
function whoAmI(): string | null {
  const w = (process.env.MARKETTIME_WHO_AM_I ?? "").trim();
  return /^[RM]\d+$/i.test(w) ? w.toUpperCase() : null;
}
export function markettimeConfigured(): boolean {
  return apiKey() !== null && whoAmI() !== null;
}

type Rec = Record<string, unknown>;
const asRecord = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type MarketTimeAddress = {
  name: string | null;
  company: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
};

export type MarketTimeOrderItem = {
  sku: string | null; // OrderDetail.itemNumber (Fishbowl part number)
  name: string | null;
  variant: string | null; // size/color/style rolled up
  quantity: number;
  price: number; // unitPrice
  upc: string | null;
};

export type MarketTimeOrder = {
  /** Internal recordID — needed for the tracking-detail POST (ship-back). */
  id: string;
  /** Public order id — rides as `<publicOrderID>-MKTTIME` in Fishbowl POs. */
  displayId: string;
  poNumber: string | null;
  /** repGroup + manufacturer status, combined for readability. */
  state: string;
  cancelled: boolean;
  orderDate: string | null;
  retailerName: string | null;
  /** billTo/shipTo email — the strongest customer-match signal. */
  email: string | null;
  contactName: string | null;
  address: MarketTimeAddress | null;
  items: MarketTimeOrderItem[];
  subtotal: number;
  shipping: number;
  discount: number;
};

async function marketTimePost(path: string, body: unknown): Promise<Rec> {
  const key = apiKey();
  if (!key) throw new Error("MARKETTIME_API_KEY is not set.");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "x-api-key": key, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MarketTime POST ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return asRecord(await res.json().catch(() => ({})));
}

function shipAddress(o: Rec): MarketTimeAddress | null {
  const line1 = str(o.shipToAddress1);
  const city = str(o.shipToCity);
  if (!line1 && !city) return null;
  return {
    name: str(o.shipToName),
    company: str(o.retailerName),
    line1,
    line2: str(o.shipToAddress2),
    city,
    state: str(o.shipToState),
    postal_code: str(o.shipToZip),
    country: str(o.shipToCountry),
    phone: str(o.shipToPhone),
    email: str(o.shipToEmail),
  };
}

function parseItem(raw: unknown): MarketTimeOrderItem {
  const d = asRecord(raw);
  const variant = [str(d.size), str(d.color), str(d.style)].filter(Boolean).join(" / ") || null;
  return {
    sku: str(d.itemNumber) ?? str(d.scsItemNumber),
    name: str(d.name) ?? str(d.description),
    variant,
    quantity: Math.round(num(d.quantity)),
    price: num(d.unitPrice),
    upc: str(d.upc) ?? str(d.scsUPC),
  };
}

function parseOrder(raw: unknown): MarketTimeOrder | null {
  const o = asRecord(raw);
  const id = str(o.recordID) ?? (o.recordID != null ? String(o.recordID) : null);
  if (!id) return null;
  const items = asArray(o.details).map(parseItem).filter((it) => (it.quantity ?? 0) > 0);
  const status = [str(o.repGroupOrderStatus), str(o.manufacturerOrderStatus)]
    .filter(Boolean)
    .join(" / ") || "UNKNOWN";
  const email =
    str(o.shipToEmail) ?? str(o.billToEmail) ?? null;
  const contactName =
    [str(o.buyerFirstName), str(o.buyerLastName)].filter(Boolean).join(" ") ||
    str(o.shipToName) ||
    str(o.billToName) ||
    null;
  return {
    id,
    displayId: (str(o.publicOrderID) ?? str(o.orderCode) ?? id).replace(/^#/, ""),
    poNumber: str(o.poNumber),
    state: status,
    // Cancelled if a cancelDate is present or a status says so.
    cancelled: !!str(o.cancelDate) || /cancel/i.test(status),
    orderDate: str(o.orderDate),
    retailerName: str(o.retailerName),
    email,
    contactName,
    address: shipAddress(o),
    items,
    subtotal: items.reduce((s, it) => s + it.price * it.quantity, 0),
    shipping: num(o.estimatedShippingCost),
    discount: num(o.orderDiscount),
  };
}

const LOOKBACK_DAYS = 90;

/**
 * Recent MarketTime orders (last LOOKBACK_DAYS by orderDate), excluding
 * cancelled. Paginates POST /orders/get via offset/recordSize.
 *
 * ⚠ The exact "unfulfilled" status enum isn't known until we see live data —
 * for now this returns all recent, non-cancelled orders and the cron/import
 * shows their status. Tighten to specific open statuses once confirmed.
 */
export async function getMarketTimeOrders(): Promise<MarketTimeOrder[]> {
  const who = whoAmI();
  if (!who) throw new Error("MARKETTIME_WHO_AM_I is not set (Repgroup R123 / Manufacturer M123).");

  const out: MarketTimeOrder[] = [];
  const size = 100;
  for (let offset = 0; offset < 5000; offset += size) {
    const data = await marketTimePost(
      `/mtpublic/api/v1/${encodeURIComponent(who)}/orders/get?offset=${offset}&recordSize=${size}&sortField=orderDate&sortOrder=DESC`,
      {},
    );
    const rows = asArray(data.response ?? data.successResponse);
    const parsed = rows.map(parseOrder).filter((o): o is MarketTimeOrder => o !== null);
    out.push(...parsed);
    if (rows.length < size) break;
  }

  const since = Date.now() - LOOKBACK_DAYS * 86400_000;
  return out.filter((o) => {
    if (o.cancelled) return false;
    if (!o.orderDate) return true;
    const t = new Date(o.orderDate).getTime();
    return Number.isNaN(t) || t >= since;
  });
}
