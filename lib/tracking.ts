/**
 * Carrier deep-link tracking. The team fulfils orders by hand and records a
 * carrier + tracking number on the order from the Purchases → order-detail
 * view; we link straight to the carrier's own tracking page rather than
 * integrating any carrier API. Add a carrier by dropping another entry here —
 * the picker, the validation, and the link all read from this list.
 */

export type CarrierId = "usps" | "ups" | "fedex";

type Carrier = { id: CarrierId; label: string; track: (code: string) => string };

const CARRIERS: Carrier[] = [
  {
    id: "usps",
    label: "USPS",
    track: (c) =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(c)}`,
  },
  {
    id: "ups",
    label: "UPS",
    track: (c) => `https://www.ups.com/track?tracknum=${encodeURIComponent(c)}`,
  },
  {
    id: "fedex",
    label: "FedEx",
    track: (c) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(c)}`,
  },
];

const byId = new Map(CARRIERS.map((c) => [c.id, c]));

/** Carriers offered in the order-detail shipment picker. */
export const CARRIER_OPTIONS = CARRIERS.map(({ id, label }) => ({ id, label }));

/** Narrow an untrusted value (request body, stored column) to a known carrier. */
export function isCarrierId(v: unknown): v is CarrierId {
  return typeof v === "string" && byId.has(v as CarrierId);
}

/** Display label for a stored carrier id ('usps' -> 'USPS'). */
export function carrierLabel(carrier?: string | null): string {
  if (!carrier) return "—";
  return byId.get(carrier as CarrierId)?.label ?? carrier;
}

/** Deep link to the carrier's own tracking page, or null if we can't build
 *  one (unknown carrier or empty number). */
export function trackingUrl(
  carrier?: string | null,
  code?: string | null
): string | null {
  const c = carrier ? byId.get(carrier as CarrierId) : undefined;
  const trimmed = code?.trim();
  return c && trimmed ? c.track(trimmed) : null;
}
