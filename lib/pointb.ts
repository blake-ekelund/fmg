/**
 * Server-only client for Point B Solutions' two APIs — used by the Order Check
 * reconciliation view (and, later, the connector that replaces LilyPad).
 *
 *  1. Synapse WMS API  (pntb1.synapsewms.net) — session-cookie auth:
 *       POST /login {username,password} → Set-Cookie SYNAPSE-SESSION + XSRF-TOKEN;
 *       subsequent POSTs send both cookies back plus header X-XSRF-TOKEN.
 *     Used for order-info (order header, line items, tracking, freight).
 *
 *  2. Integration API  (integrations.pointbsolutions.com) — bearer auth:
 *       POST /api/token {name,password} → {token}; then Authorization: Bearer.
 *     Used for order/fees (freight + pick/pack charges → the ×1.25 base).
 *
 * The two APIs are SEPARATE accounts: the WMS uses SYNAPSE_USER (NATURAL-API);
 * the Integration API uses POINTB_FEES_USER (the `fishbowl_api` login LilyPad
 * uses). Everything here is read-only. Never import from a client component.
 */

const SYNAPSE_URL = () => (process.env.SYNAPSE_API_URL || "").replace(/\/+$/, "");
const FEES_URL = () =>
  (process.env.POINTB_FEES_URL || "https://integrations.pointbsolutions.com").replace(/\/+$/, "");
const CUST_ID = () => process.env.POINTB_CUSTOMER_ID || "1590";
const FACILITY = () => process.env.POINTB_FACILITY || "PB1";

const numOf = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** True when the Synapse WMS creds are present (order-info works). */
export function synapseConfigured(): boolean {
  return !!(SYNAPSE_URL() && process.env.SYNAPSE_USER && process.env.SYNAPSE_PASS);
}
/** True when the Integration API creds are present (order/fees works). */
export function feesConfigured(): boolean {
  return !!(process.env.POINTB_FEES_USER && process.env.POINTB_FEES_PASS);
}

/* ── Synapse WMS (session + XSRF) ─────────────────────────────────────── */

type SynapseSession = { cookie: string; xsrf: string; base: string };

/**
 * A Synapse connection target: which base URL to hit and which creds to send.
 * Defaults to the shared read env (SYNAPSE_API_URL/USER/PASS), used by every
 * read path. The create-order write path passes an explicit TEST target so it
 * never rides on — or disturbs — the prod-pointed read var.
 */
type SynapseTarget = { url: string; user?: string; pass?: string };
const READ_TARGET = (): SynapseTarget => ({
  url: SYNAPSE_URL(),
  user: process.env.SYNAPSE_USER,
  pass: process.env.SYNAPSE_PASS,
});

async function synapseLogin(target: SynapseTarget = READ_TARGET()): Promise<SynapseSession> {
  const res = await fetch(`${target.url}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: target.user, password: target.pass }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Synapse login failed (${res.status})`);
  const setCookies: string[] =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  const grab = (name: string) => {
    for (const c of setCookies) {
      const m = c.match(new RegExp(`${name}=([^;]+)`));
      if (m) return m[1];
    }
    return "";
  };
  const session = grab("SYNAPSE-SESSION");
  const xsrf = grab("XSRF-TOKEN");
  if (!session || !xsrf) throw new Error("Synapse login returned no session/XSRF cookie.");
  return { cookie: `SYNAPSE-SESSION=${session}; XSRF-TOKEN=${xsrf}`, xsrf, base: target.url };
}

async function synapsePost(
  s: SynapseSession,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${s.base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: s.cookie,
      "X-XSRF-TOKEN": s.xsrf,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = data.error as { message?: string } | undefined;
    throw new Error(`Synapse ${path} failed (${res.status}): ${err?.message ?? "unknown"}`);
  }
  return data;
}

export type SynapseOrder = {
  orderid: number;
  shipid: number;
  order_type: string;
  order_type_desc: string;
  order_status: string;
  order_status_desc: string;
  from_facility: string | null;
  po_number: string;
  reference: string;
  carrier: string | null;
  date_shipped: string | null;
  shipping_cost: number | null;
  ship_to_name: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  qty_ship: number | null;
  order_details: Array<{ item: string; qty_order: number; qty_ship: number; uom: string }>;
  plate_details: Array<{ tracking_number: string | null; carton_type?: string | null }>;
};

/**
 * Look up a Synapse order by its Fishbowl SO number (= Synapse `po_number`) and
 * customer PO (= Synapse `reference`) — order-info requires the po+reference pair.
 * Returns null when the order isn't found in Synapse.
 */
export async function getSynapseOrder(
  fbSoNum: string,
  fbCustomerPO: string,
): Promise<SynapseOrder | null> {
  const s = await synapseLogin();
  const info = await synapsePost(s, "/orders/order-info", {
    custid: CUST_ID(),
    po: fbSoNum,
    reference: fbCustomerPO,
  }).catch(() => ({}) as Record<string, unknown>);
  const order = ((info.order as SynapseOrder[]) || [])[0];
  if (!order) return null;

  // order-info does NOT carry carton tracking; pull plate_details from
  // shipped-orders (the same source the batch view uses) so the detail's
  // tracking is consistent with the grid. Shipped orders only — empty for
  // not-yet-shipped orders, which is fine.
  const shipped = await synapsePost(s, "/orders/shipped-orders", {
    request_type: "order",
    custid: CUST_ID(),
    po: fbSoNum,
    reference: fbCustomerPO,
  }).catch(() => ({}) as Record<string, unknown>);
  const shipRow = ((shipped.orders as Array<Record<string, unknown>>) || [])[0];
  if (shipRow && Array.isArray(shipRow.plate_details)) {
    order.plate_details = shipRow.plate_details as SynapseOrder["plate_details"];
  }
  return order;
}

export type ShipSummary = {
  po: string;
  orderid: number;
  status: string;
  dateShipped: string | null;
  shippingCost: number | null;
  tracking: string[];
};

/**
 * All Synapse shipments in the last `days` — ONE call, for batch reconciliation
 * (match to Fishbowl orders by `po` = Fishbowl SO num). Returns [] on any error
 * so the batch view degrades to Fishbowl-only rather than failing.
 */
export async function getRecentShippedOrders(days = 60): Promise<ShipSummary[]> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date, tail: string) =>
    `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${tail}`;
  const end = new Date();
  const begin = new Date(end.getTime() - days * 86400_000);

  const s = await synapseLogin();
  const data = await synapsePost(s, "/orders/shipped-orders", {
    request_type: "range",
    begin_date: fmt(begin, "00:00:00"),
    end_date: fmt(end, "23:59:59"),
    custid: CUST_ID(),
  }).catch(() => ({}) as Record<string, unknown>);

  const orders = (data.orders as Array<Record<string, unknown>>) || [];
  return orders.map((o) => ({
    po: String(o.po_number ?? ""),
    orderid: Number(o.orderid) || 0,
    status: String(o.order_status ?? ""),
    dateShipped: (o.date_shipped as string) ?? null,
    shippingCost: o.shipping_cost != null ? Number(o.shipping_cost) : null,
    tracking: Array.isArray(o.plate_details)
      ? ((o.plate_details as Array<{ tracking_number?: string | null }>)
          .map((p) => p.tracking_number)
          .filter(Boolean) as string[])
      : [],
  }));
}

/**
 * The RAW order-info + shipped-orders rows for one order — every field Point B
 * returns, unfiltered (for the field-relationships inspector). order-info is the
 * order header/detail; shipped-orders adds plate_details (carton tracking).
 */
export async function getSynapseOrderRaw(
  fbSoNum: string,
  fbCustomerPO: string,
): Promise<{ order: Record<string, unknown> | null; shipped: Record<string, unknown> | null }> {
  const s = await synapseLogin();
  const info = await synapsePost(s, "/orders/order-info", {
    custid: CUST_ID(),
    po: fbSoNum,
    reference: fbCustomerPO,
  }).catch(() => ({}) as Record<string, unknown>);
  const order = ((info.order as Record<string, unknown>[]) || [])[0] ?? null;

  const shipped = await synapsePost(s, "/orders/shipped-orders", {
    request_type: "order",
    custid: CUST_ID(),
    po: fbSoNum,
    reference: fbCustomerPO,
  }).catch(() => ({}) as Record<string, unknown>);
  const shipRow = ((shipped.orders as Record<string, unknown>[]) || [])[0] ?? null;

  return { order, shipped: shipRow };
}

/* ── Egress — create-order (WRITE, TEST-ONLY) ─────────────────────────── */

/**
 * The create-order write target. Deliberately SEPARATE from the read env so a
 * write test never rides on — or forces us to repoint — SYNAPSE_API_URL, which
 * the reconciliation reads use against PROD. Prefers the dedicated test vars and
 * falls back to the shared ones, so a test-only deployment can just set
 * SYNAPSE_API_URL to the test base and skip the SYNAPSE_TEST_* vars entirely.
 */
const TEST_TARGET = (): SynapseTarget => ({
  url: (process.env.SYNAPSE_TEST_API_URL || process.env.SYNAPSE_API_URL || "").replace(/\/+$/, ""),
  user: process.env.SYNAPSE_TEST_USER || process.env.SYNAPSE_USER,
  pass: process.env.SYNAPSE_TEST_PASS || process.env.SYNAPSE_PASS,
});

/**
 * Hard guard for the ONLY write path in this client. create-order is egress:
 * it makes the warehouse physically ship. Until the full connector is built,
 * shadow-run, and cut over (see docs/pointb-connector.md §8), this is allowed
 * *only* against the Synapse TEST environment.
 *
 * Returns a human reason the write is blocked, or null when it's safe. The rule
 * is fail-closed: we allow the write only when the TEST base URL has an explicit
 * `test` path segment and no `prod` segment. A missing/typo'd/prod URL blocks.
 */
export function synapseWriteBlockReason(): string | null {
  const url = TEST_TARGET().url;
  if (!url) return "No Synapse test base URL set (SYNAPSE_TEST_API_URL / SYNAPSE_API_URL).";
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return `Synapse test base URL is not a valid URL (${url}).`;
  }
  const segs = path.split("/").filter(Boolean); // e.g. ["test","api"]
  if (segs.includes("prod")) {
    return `Synapse test base URL points at PROD (${url}) — create-order is test-only for now.`;
  }
  if (!segs.includes("test")) {
    return `Synapse test base URL has no 'test' path segment (${url}) — refusing to write.`;
  }
  return null;
}

/** True when create-order may run (test creds present AND pointed at TEST). */
export function canCreateOrder(): boolean {
  const tgt = TEST_TARGET();
  return !!(tgt.url && tgt.user && tgt.pass) && synapseWriteBlockReason() === null;
}

/** One hand-specified order to fire at Synapse. Constants are filled in below. */
export type CreateOrderInput = {
  poNumber: string; // Fishbowl so.num — rides as Synapse po_number (≤20)
  reference: string; // Fishbowl so.customerPO — Synapse reference (≤20)
  shipTo: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
    countryCode?: string; // default US
    phone?: string;
    email?: string;
  };
  details: Array<{ item: string; qty: number; uom?: string }>; // uom default EA
};

export type CreateOrderResult = {
  ok: boolean;
  orderid: number | null; // Synapse order id, when the response carries one
  sent: { header: Record<string, unknown>; details: Record<string, unknown>[] };
  raw: Record<string, unknown>; // full Synapse response, for inspection
};

/**
 * POST /orders/create-order against the Synapse WMS. TEST-ONLY: throws before
 * touching the network if `synapseWriteBlockReason()` blocks it. Maps a single
 * hand-specified order onto the create-order body using the fixed constants from
 * the field contract (custid 1590, order_type O, from_facility PB1, ship_type S,
 * ship_terms PPD; carrier omitted so Point B rate-shops). Field lengths are
 * truncated to the documented Synapse limits (see docs/pointb-connector.md §5a).
 */
export async function createSynapseOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const block = synapseWriteBlockReason();
  if (block) throw new Error(`create-order refused: ${block}`);

  const t = (v: string | undefined, n: number) => (v ?? "").trim().slice(0, n);

  const poNumber = t(input.poNumber, 20);
  const reference = t(input.reference, 20);
  if (!poNumber) throw new Error("poNumber (Fishbowl so.num) is required.");
  if (!reference) throw new Error("reference (Fishbowl so.customerPO) is required.");
  if (!input.shipTo) throw new Error("shipTo is required.");
  if (!t(input.shipTo.name, 40)) throw new Error("shipTo.name is required.");
  if (!t(input.shipTo.address1, 40)) throw new Error("shipTo.address1 is required.");
  if (!t(input.shipTo.city, 40)) throw new Error("shipTo.city is required.");
  if (!t(input.shipTo.state, 5)) throw new Error("shipTo.state is required.");
  if (!t(input.shipTo.postalCode, 10)) throw new Error("shipTo.postalCode is required.");

  const details = (input.details ?? []).map((d, i) => {
    const item = t(d.item, 50);
    if (!item) throw new Error(`details[${i}].item is required.`);
    const qty = Number(d.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`details[${i}].qty must be a positive number.`);
    return {
      item,
      uom_entered: t((d.uom || "EA").toUpperCase(), 4),
      qty_entered: Math.trunc(qty),
    };
  });
  if (details.length === 0) throw new Error("At least one details line is required.");

  const header: Record<string, unknown> = {
    custid: CUST_ID(),
    order_type: "O", // Outbound
    from_facility: FACILITY(), // PB1
    po_number: poNumber,
    reference,
    ship_type: "S", // Small Pkg
    ship_terms: "PPD", // Prepaid
    validate_shipto: "Y",
    ship_to_name: t(input.shipTo.name, 40),
    ship_to_address_1: t(input.shipTo.address1, 40),
    ship_to_address_2: t(input.shipTo.address2, 40),
    ship_to_city: t(input.shipTo.city, 40),
    ship_to_state: t(input.shipTo.state, 5),
    ship_to_postal_code: t(input.shipTo.postalCode, 10),
    ship_to_country_code: t(input.shipTo.countryCode || "US", 3),
    ship_to_phone: t(input.shipTo.phone, 25),
    ship_to_email: t(input.shipTo.email, 60),
  };

  const s = await synapseLogin(TEST_TARGET());
  const data = await synapsePost(s, "/orders/create-order", { header, details });

  // The success shape isn't pinned down yet; pull an orderid from the common
  // shapes and always return the raw body so the caller can inspect it.
  const orderRow = ((data.order as Record<string, unknown>[]) || [])[0];
  const orderid =
    numOf(data.orderid) || numOf(orderRow?.orderid) || numOf((data.data as Record<string, unknown>)?.orderid) || 0;

  return { ok: true, orderid: orderid || null, sent: { header, details }, raw: data };
}

/* ── Integration API (bearer) — order fees ────────────────────────────── */

async function feesToken(): Promise<string> {
  const res = await fetch(`${FEES_URL()}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: process.env.POINTB_FEES_USER,
      password: process.env.POINTB_FEES_PASS,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string };
  if (!res.ok || !data.token) throw new Error(`Fees token failed (${res.status}).`);
  return data.token;
}

export type OrderFees = {
  orderId: number;
  totalAmount: number;
  detail: Array<{ code: number; description: string; amount: number }>;
};

async function fetchFeesWithToken(token: string, orderId: number): Promise<OrderFees | null> {
  const res = await fetch(`${FEES_URL()}/api/order/fees?customerId=${CUST_ID()}&orderId=${orderId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    orderId?: number;
    totalAmount?: string | number;
    detail?: Array<{ code: number; description: string; amount: string | number }>;
  };
  if (data.orderId == null) return null;
  const n = (v: string | number | undefined) => (typeof v === "number" ? v : Number(v) || 0);
  return {
    orderId: data.orderId,
    totalAmount: n(data.totalAmount),
    detail: (data.detail ?? []).map((d) => ({ ...d, amount: n(d.amount) })),
  };
}

/** Per-order freight + pick/pack charges. `totalAmount × 1.25` = the FB freight line. */
export async function getOrderFees(synapseOrderId: number): Promise<OrderFees | null> {
  return fetchFeesWithToken(await feesToken(), synapseOrderId);
}

/** Fees for many orders, reusing ONE token — for batch monitoring. */
export async function getOrderFeesMany(orderIds: number[]): Promise<Map<number, OrderFees>> {
  const token = await feesToken();
  const out = new Map<number, OrderFees>();
  for (const id of orderIds) {
    const f = await fetchFeesWithToken(token, id).catch(() => null);
    if (f) out.set(id, f);
  }
  return out;
}

export const POINTB_MARKUP = 1.25; // <ShipPercent>0.25</ShipPercent> from LilyPad config
