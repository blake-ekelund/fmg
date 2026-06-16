/**
 * Storefront order shape (the wholesale project's `orders` table) plus the
 * display helpers shared by the Purchases list and the order-detail invoice.
 * Read-only here — writes go through the storefront server / the
 * /api/storefront-orders routes (service role).
 */

export type OrderAddress = {
  name?: string;
  company?: string | null;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type OrderLineItem = {
  line_no?: number;
  type?: string;
  part?: string;
  name?: string;
  form?: string | null;
  price?: number;
  quantity?: number;
  total?: number;
};

export type OrderDiscount = { type?: string; label?: string; amount?: number };

export type StorefrontOrder = {
  id: string;
  created_at: string;
  number?: number | null;
  store?: string | null;
  channel?: "d2c" | "wholesale" | string;
  status?: string;
  payment_status?: string;
  payment_terms?: string | null;
  sales_rep?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  ship_to?: OrderAddress | null;
  bill_to?: OrderAddress | null;
  subtotal?: number;
  shipping?: number;
  tax?: number;
  discount?: number;
  discounts?: OrderDiscount[] | null;
  total?: number;
  items?: OrderLineItem[] | null;
  note?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  /** Deep-link shipment tracking, recorded from the Purchases order-detail
   *  view. carrier: 'usps' | 'ups' | 'fedex'. No carrier API — we link out
   *  to the carrier's own page (see lib/tracking.ts). */
  carrier?: string | null;
  tracking_code?: string | null;
  shipped_at?: string | null;
  /** Fishbowl entry stamp — set from the Purchases view once the order's
   *  details are keyed into Fishbowl. The fulfillment gate that replaces the
   *  old `approved_*` columns. */
  fishbowl_entered_at?: string | null;
  fishbowl_entered_by?: string | null;
  [key: string]: unknown;
};

/** Human-facing order number: SASSY-#### / NI-####. Legacy rows placed
 *  before `store` was tracked fall back to SO-####. */
export function orderRef(o: Pick<StorefrontOrder, "store" | "number" | "id">): string {
  if (o.number == null) return o.id ? o.id.slice(0, 8) : "—";
  const prefix = o.store === "ni" ? "NI" : o.store === "sassy" ? "SASSY" : "SO";
  return `${prefix}-${o.number}`;
}

export type InvoiceLine = {
  lineNo: number;
  kind: "Sale" | "Discount" | "Shipping";
  part: string;
  description: string;
  unitPrice: number | null;
  quantity: number | null;
  amount: number;
};

/**
 * Compose the invoice's typed line list: sale lines from `items`, then
 * discount lines (structured `discounts`, or a rolled-up `discount`), then
 * a shipping line. Tolerant of legacy item rows that predate line_no/type.
 */
export function composeInvoiceLines(o: StorefrontOrder): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  let n = 0;

  for (const it of o.items ?? []) {
    n += 1;
    const qty = it.quantity ?? null;
    const unit = it.price ?? null;
    const amount =
      it.total ?? (unit != null && qty != null ? unit * qty : 0);
    lines.push({
      lineNo: it.line_no ?? n,
      kind: "Sale",
      part: it.part ?? "—",
      description: it.form ? `${it.name ?? ""} · ${it.form}` : it.name ?? "—",
      unitPrice: unit,
      quantity: qty,
      amount,
    });
  }

  const discountList: OrderDiscount[] =
    o.discounts && o.discounts.length
      ? o.discounts
      : o.discount && o.discount > 0
        ? [{ type: "discount", label: "Discount", amount: o.discount }]
        : [];
  for (const d of discountList) {
    n += 1;
    lines.push({
      lineNo: n,
      kind: "Discount",
      part: "—",
      description: d.label ?? "Discount",
      unitPrice: null,
      quantity: null,
      amount: -Math.abs(d.amount ?? 0),
    });
  }

  if (o.shipping != null && o.shipping > 0) {
    n += 1;
    lines.push({
      lineNo: n,
      kind: "Shipping",
      part: "—",
      description: "Shipping",
      unitPrice: null,
      quantity: null,
      amount: o.shipping,
    });
  }

  return lines;
}

/** Where an order sits in the fulfillment pipeline, derived from its columns.
 *  Precedence mirrors the workflow: cancelled → shipped (has a tracking
 *  number) → needs tracking (in Fishbowl, not yet shipped) → needs Fishbowl
 *  entry. `badge` is the Tailwind bg+text for the status pill. */
export type FulfillmentKey =
  | "needs-fishbowl"
  | "needs-tracking"
  | "shipped"
  | "cancelled";

export function fulfillmentState(o: StorefrontOrder): {
  key: FulfillmentKey;
  label: string;
  badge: string;
} {
  if (o.status === "cancelled")
    return { key: "cancelled", label: "Cancelled", badge: "bg-gray-100 text-gray-500" };
  if (o.tracking_code)
    return { key: "shipped", label: "Shipped", badge: "bg-emerald-50 text-emerald-700" };
  if (o.fishbowl_entered_at)
    return { key: "needs-tracking", label: "Needs tracking", badge: "bg-sky-50 text-sky-700" };
  return { key: "needs-fishbowl", label: "Needs Fishbowl", badge: "bg-rose-50 text-rose-700" };
}
