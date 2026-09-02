/**
 * Server-only client for the MarketTime External API — the second marketplace
 * source (after Faire) that flows into the storefront order pipeline. Verified
 * live against the real API 2026-08-13 (not just the OpenAPI spec).
 *
 * Auth: header `x-api-key: <MARKETTIME_API_KEY>`. Endpoints are scoped by a
 * "Who Am I" path segment — our Manufacturer ID (M123; FMG is M1292), read from
 * `MANUFACTURER_ID` (see whoAmI() for the accepted names). markettimeConfigured()
 * stays false until the key + id are set.
 *
 * Endpoint used:
 *   POST /mtpublic/api/v1/{whoAmI}/orders/get   list orders (paginated)
 *     • body is a QueryFilter[] — `[]` = no filter; we filter by orderDate and
 *       decide on status ourselves (see getMarketTimeOrders for why).
 *     • NO sortField/sortType params — they 500 this endpoint.
 *     • response: { success, response: Order[], total, error, timeStamp }.
 *
 * Live gotchas that bit us, all three found by orders that never arrived:
 *  - A STATUS-FILTERED query is unreliable. Eight identical calls in one second
 *    returned 0, 2, 0, 2, 2, 0, 2, 2 — empty about a third of the time, with the
 *    orders plainly there. A DATE-filtered query is stable (eight calls, 100
 *    rows each), so that is what we send.
 *  - An order is only ours to import for part of its life: OPEN -> RECEIVED ->
 *    PROCESSED -> SHIPPED. Watching OPEN alone missed everything that advanced
 *    between polls.
 *  - `cancelDate` is a SHIP-BY date, not a cancellation, and sits on plenty of
 *    live orders. Reading it as "cancelled" silently dropped them.
 *
 * The account holds 6,500+ orders back to 2016 in NON-chronological order
 * (offset 0 = 2016, the tail is not the newest), so an unfiltered offset walk
 * never reaches current business — the date bound is doing real work. There is
 * no `publicOrderID`-as-number; we key on recordID. Ship-back-sync (POST
 * .../orders/{id}/trackingdetails) is documented but not built here yet.
 */

import { ACTIVE_NET_TERMS, FB_TERMS } from "./fishbowlEstimate";

const BASE = "https://publicapi.markettime.com";

function apiKey(): string | null {
  const k = (process.env.MARKETTIME_API_KEY ?? "").trim();
  return k.length > 3 ? k : null;
}

/**
 * Our MarketTime identity — the `{whoAmI}` path segment. It's a Repgroup
 * (R123) or Manufacturer (M123) id; FMG is a manufacturer, so `MANUFACTURER_ID`
 * is the name it's actually stored under (in `.env.local` and Vercel).
 *
 * Accepts, in order: MARKETTIME_WHO_AM_I (already R#/M#), MANUFACTURER_ID /
 * MARKETTIME_MANUFACTURER_ID (→ M#), MARKETTIME_REP_GROUP_ID (→ R#). Bare
 * digits are prefixed with the type implied by the var name, so `123` in
 * MANUFACTURER_ID becomes `M123`.
 */
function whoAmI(): string | null {
  const explicit = (process.env.MARKETTIME_WHO_AM_I ?? "").trim();
  if (/^[RM]\d+$/i.test(explicit)) return explicit.toUpperCase();

  const norm = (raw: string, prefix: "M" | "R"): string | null => {
    const v = raw.trim().toUpperCase();
    if (/^[RM]\d+$/.test(v)) return v;
    if (/^\d+$/.test(v)) return `${prefix}${v}`;
    return null;
  };

  for (const name of ["MANUFACTURER_ID", "MARKETTIME_MANUFACTURER_ID"]) {
    const v = norm(process.env[name] ?? "", "M");
    if (v) return v;
  }
  for (const name of ["MARKETTIME_REP_GROUP_ID", "REP_GROUP_ID"]) {
    const v = norm(process.env[name] ?? "", "R");
    if (v) return v;
  }
  return null;
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
  /** recordID as string — unique idempotency key; rides as `<id>-MKTTIME` in Fishbowl POs. */
  displayId: string;
  /** MarketTime's UUID public order id — kept for cross-reference, not used as the ref. */
  publicOrderId: string | null;
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
  /** Fishbowl payment-terms name, or null when MarketTime's free text couldn't
   *  be classified. See classifyMarketTimeTerms(). */
  paymentTerms: string | null;
  /** MarketTime's raw `paymentTerm` text, kept for the sync report so an
   *  unclassified value is visible rather than silently defaulted. */
  paymentTermRaw: string | null;
  /** True when MarketTime has a card on the order (isCCAttached / a token). */
  cardOnOrder: boolean;
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

/** Card brands that show up in MarketTime's free-text `paymentTerm`. */
const CARD_TEXT = /\b(credit\s*card|visa|master\s*card|mastercard|amex|american\s*express|discover|cc)\b/i;
/**
 * Net-day terms, however the writer abbreviated them. Real values in this
 * account: "Net 30", "Net 30 Days", "NET 30 HOSPITAL ONLY", "NET30", "N30 HOSP
 * ONLY", "N/30", "N30 - CASINO", "Net 45", "NET60". The day count is captured
 * rather than matched against 30 alone — reading a Net 45 as NET 30 would put
 * the invoice-chase 15 days early, which is exactly the kind of quiet wrongness
 * this whole classifier exists to stop.
 */
const NET_TEXT = /\bn(?:et)?\s*\/?\s*(\d{2,3})\b/i;

/**
 * Decide which Fishbowl payment terms a MarketTime order books under.
 *
 * MarketTime sends three payment signals and we used to read none of them, so
 * every imported order booked as NET 30 — including the card orders, which is
 * an invoice you'd chase for money already collected. Over a 600-order sample
 * this resolves 285 to CREDIT CARD and 264 to a net term, leaving 48.
 *
 * `isCCAttached` and `paymentToken` are structured and trusted first; the free
 * text is only pattern-matched after. Anything left — "SEE NOTES" (36), a blank
 * field (12), a value nobody has seen yet — returns null rather than a guess.
 *
 * Null deliberately falls back to NET 30 downstream, not to CREDIT CARD. The
 * two errors are not symmetric: a NET 30 order mislabelled CREDIT CARD reads as
 * already paid and never gets collected, while a card order mislabelled NET 30
 * surfaces the moment someone looks at AR. Guess toward the recoverable one.
 */
export function classifyMarketTimeTerms(o: Rec): string | null {
  if (o.isCCAttached === true || str(o.paymentToken)) return FB_TERMS.creditCard;
  const text = str(o.paymentTerm);
  if (!text) return null;
  if (CARD_TEXT.test(text)) return FB_TERMS.creditCard;
  const net = NET_TEXT.exec(text);
  // An unknown day count (NET 90, NET 10 — both switched off in Fishbowl) is
  // left unclassified rather than rounded to the nearest term we do have.
  if (net) return ACTIVE_NET_TERMS[net[1]] ?? null;
  return null;
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
    // recordID is unique, stable, and short — the right idempotency key and
    // Fishbowl Customer PO stem (`<recordID>-MKTTIME`). publicOrderID exists too
    // but is a 36-char UUID; orderCode ("DRCT") is an order *type*, not unique —
    // an earlier version used it as the id and would have collided every order.
    displayId: id,
    publicOrderId: str(o.publicOrderID),
    poNumber: str(o.poNumber),
    state: status,
    cancelled: isCancelled(o, status),
    orderDate: str(o.orderDate),
    retailerName: str(o.retailerName),
    email,
    contactName,
    address: shipAddress(o),
    items,
    subtotal: items.reduce((s, it) => s + it.price * it.quantity, 0),
    shipping: num(o.estimatedShippingCost),
    discount: num(o.orderDiscount),
    paymentTerms: classifyMarketTimeTerms(o),
    paymentTermRaw: str(o.paymentTerm),
    cardOnOrder: o.isCCAttached === true || !!str(o.paymentToken),
  };
}

/**
 * A MarketTime QueryFilter (the POST-body entry for /orders/get). Operators are
 * word tokens — `eq`, `gte`, `lte`, `gt`, `lt`, `ne` (`>=`/`<=` are rejected).
 */
type QueryFilter = { field: string; operator: string; value: string };

/**
 * manufacturerOrderStatus values that still need entering into Fishbowl.
 *
 * An order moves OPEN -> RECEIVED -> PROCESSED -> SHIPPED. RECEIVED means it has
 * been transmitted to us and is waiting to be keyed, which is exactly what this
 * import is for; it used to be excluded, and any order that advanced past OPEN
 * before a poll caught it was simply never imported (PO P260934, Peppermill
 * Casino, sat in RECEIVED and never arrived).
 *
 * PROCESSED and SHIPPED are deliberately out: those are already handled.
 * BACKORDER exists too and is left out for now — it may already be in Fishbowl
 * awaiting stock, and importing it could duplicate.
 */
const IMPORTABLE_MFR_STATUSES = new Set(["OPEN", "RECEIVED"]);

/**
 * How far back to look. The date filter is what makes the query reliable (see
 * getMarketTimeOrders), so it needs SOME bound; 90 days covers anything still
 * unshipped without dragging in the 3,500-order RECEIVED archive going back to
 * 2016. Over the last 90 days this window holds ~140 orders, of which a handful
 * are importable.
 */
const LOOKBACK_DAYS = 90;

/**
 * Is this order actually cancelled?
 *
 * NOT "does it have a cancelDate". In wholesale a cancel date is the ship-by
 * date the retailer sets — cancel if it hasn't shipped by then — and it is a
 * routine field on a live order. Reading it as a cancellation is what dropped
 * Peppermill's PO P260934, which carried a cancelDate two months out. Proof it
 * means nothing of the sort: in the last 90 days one SHIPPED order and eight
 * PROCESSED ones carry cancelDates, and none of them were cancelled.
 *
 * A cancellation is the STATUS saying so, or the record being deleted.
 */
export function isCancelled(o: Rec, status: string): boolean {
  if (o.recordDeleted === true) return true;
  return /cancel/i.test(status);
}

/**
 * Current importable MarketTime orders.
 *
 * Filtered SERVER-SIDE by ORDER DATE, then by status in our own code — which is
 * the opposite of the obvious approach, for a specific reason. Asking the API to
 * filter on manufacturerOrderStatus returns an EMPTY result roughly a third of
 * the time: eight identical status-filtered calls in one second returned 0, 2,
 * 0, 2, 2, 0, 2, 2. The sync cannot import what the API declines to return, and
 * that is why Artisan Center sat unimported for 64 hours across ~128 polls while
 * plainly OPEN.
 *
 * The same query filtered by orderDate is stable — eight calls, 100 rows every
 * time — so the date bound is what makes this reliable, and the status decision
 * moves into code where it can't flap. An offset walk with no filter is not an
 * option either: the account holds 6,500+ orders back to 2016 and /orders/get
 * has no working sort (the documented sort params 500 the endpoint).
 */
export async function getMarketTimeOrders(): Promise<MarketTimeOrder[]> {
  const who = whoAmI();
  if (!who) {
    throw new Error(
      "MarketTime identity not set — set MANUFACTURER_ID (M123) or MARKETTIME_WHO_AM_I.",
    );
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  const filter: QueryFilter[] = [
    { field: "orderDate", operator: "gte", value: since },
  ];

  const size = 100;
  const raw: Rec[] = [];
  for (let offset = 0; offset < 5000; offset += size) {
    // NB: no sortField/sortType — those trigger a 500 on this endpoint.
    const data = await marketTimePost(
      `/mtpublic/api/v1/${encodeURIComponent(who)}/orders/get?offset=${offset}&recordSize=${size}`,
      filter,
    );
    let rows = asArray(data.response ?? data.successResponse);
    // This API returns an empty page under load even when rows exist. The date
    // filter makes that rare rather than impossible, so an empty FIRST page is
    // retried once before being believed — the difference between importing an
    // order now and leaving it for the next run.
    if (rows.length === 0 && offset === 0) {
      const retry = await marketTimePost(
        `/mtpublic/api/v1/${encodeURIComponent(who)}/orders/get?offset=0&recordSize=${size}`,
        filter,
      );
      rows = asArray(retry.response ?? retry.successResponse);
    }
    raw.push(...rows.map(asRecord));
    if (rows.length < size) break;
  }

  const seen = new Set<string>();
  const out: MarketTimeOrder[] = [];
  for (const r of raw) {
    const status = String(r.manufacturerOrderStatus ?? "").trim().toUpperCase();
    if (!IMPORTABLE_MFR_STATUSES.has(status)) continue;
    const parsed = parseOrder(r);
    if (!parsed || parsed.cancelled) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out;
}
