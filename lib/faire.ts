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

export function faireConfigured(): boolean {
  return (process.env.FAIRE_ACCESS_TOKEN ?? "").trim().length > 5;
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

async function faireGet(path: string): Promise<Rec> {
  const token = (process.env.FAIRE_ACCESS_TOKEN ?? "").trim();
  if (!token) throw new Error("FAIRE_ACCESS_TOKEN is not set.");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-FAIRE-ACCESS-TOKEN": token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Faire ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return asRecord(await res.json().catch(() => ({})));
}

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
    subtotal: items.reduce((s, it) => s + it.price * it.quantity, 0),
  };
}

/** States that mean "a real order a brand should fulfill". Cancelled/backorder
 *  variants are excluded; DELIVERED etc. are long past import relevance. */
const IMPORTABLE_STATES = new Set(["NEW", "PROCESSING", "PRE_TRANSIT", "IN_TRANSIT"]);

/**
 * All current importable orders, paging until Faire runs dry (capped at 10
 * pages × 50 = 500 orders per run — far above any realistic backlog).
 */
export async function getFaireOrders(): Promise<FaireOrder[]> {
  const out: FaireOrder[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await faireGet(`/orders?page=${page}&limit=50`);
    const raw = asArray(data.orders);
    const parsed = raw.map(parseOrder).filter((o): o is FaireOrder => o !== null);
    out.push(...parsed);
    if (raw.length < 50) break;
  }
  return out.filter((o) => IMPORTABLE_STATES.has(o.state));
}
