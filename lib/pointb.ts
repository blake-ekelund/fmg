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

/** True when the Synapse WMS creds are present (order-info works). */
export function synapseConfigured(): boolean {
  return !!(SYNAPSE_URL() && process.env.SYNAPSE_USER && process.env.SYNAPSE_PASS);
}
/** True when the Integration API creds are present (order/fees works). */
export function feesConfigured(): boolean {
  return !!(process.env.POINTB_FEES_USER && process.env.POINTB_FEES_PASS);
}

/* ── Synapse WMS (session + XSRF) ─────────────────────────────────────── */

type SynapseSession = { cookie: string; xsrf: string };

async function synapseLogin(): Promise<SynapseSession> {
  const res = await fetch(`${SYNAPSE_URL()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: process.env.SYNAPSE_USER,
      password: process.env.SYNAPSE_PASS,
    }),
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
  return { cookie: `SYNAPSE-SESSION=${session}; XSRF-TOKEN=${xsrf}`, xsrf };
}

async function synapsePost(
  s: SynapseSession,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SYNAPSE_URL()}${path}`, {
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
