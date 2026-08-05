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
  const data = await synapsePost(s, "/orders/order-info", {
    custid: CUST_ID(),
    po: fbSoNum,
    reference: fbCustomerPO,
  }).catch(() => ({}) as Record<string, unknown>);
  const orders = (data.order as SynapseOrder[]) || [];
  return orders[0] ?? null;
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

/** Per-order freight + pick/pack charges. `totalAmount × 1.25` = the FB freight line. */
export async function getOrderFees(synapseOrderId: number): Promise<OrderFees | null> {
  const token = await feesToken();
  const res = await fetch(
    `${FEES_URL()}/api/order/fees?customerId=${CUST_ID()}&orderId=${synapseOrderId}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    orderId?: number;
    totalAmount?: string | number;
    detail?: Array<{ code: number; description: string; amount: string | number }>;
  };
  if (data.orderId == null) return null;
  const num = (v: string | number | undefined) => (typeof v === "number" ? v : Number(v) || 0);
  return {
    orderId: data.orderId,
    totalAmount: num(data.totalAmount),
    detail: (data.detail ?? []).map((d) => ({ ...d, amount: num(d.amount) })),
  };
}

export const POINTB_MARKUP = 1.25; // <ShipPercent>0.25</ShipPercent> from LilyPad config
