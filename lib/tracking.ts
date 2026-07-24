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

/**
 * Map a Fishbowl `carrier.name` to a known carrier id — but only when it's a
 * real carrier we can link. Most Fishbowl shipments book to "RATESHOP" (a
 * rate-shopper) rather than the actual carrier, so this returns null for those
 * and we fall back to detecting the carrier from the tracking number itself.
 */
export function fishbowlCarrierId(name?: string | null): CarrierId | null {
  switch ((name ?? "").trim().toUpperCase()) {
    case "UPS":
      return "ups";
    case "FEDX":
    case "FEDEX":
      return "fedex";
    case "USPS":
      return "usps";
    default:
      return null;
  }
}

/**
 * Guess the carrier from a tracking number's format. Reliable for the big three
 * FMG actually uses; anything unrecognised (Amazon, DHL, regional 3PLs) returns
 * null, and the caller shows the bare number with no deep link.
 *
 *  - UPS   → starts "1Z"
 *  - USPS  → 20–26 digits, starts 91/92/93/94/95 (IMpb), or a 420ZIP prefix
 *  - FedEx → 12 or 15 digits (Express / Ground)
 */
export function detectCarrier(trackingNum?: string | null): CarrierId | null {
  const t = (trackingNum ?? "").replace(/\s+/g, "").toUpperCase();
  if (!t) return null;
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return "ups";
  if (/^420\d{5}(9[1-5]\d{18,24})$/.test(t)) return "usps"; // 420 + ZIP + IMpb
  if (/^9[1-5]\d{18,24}$/.test(t)) return "usps";
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t)) return "fedex";
  return null;
}

/**
 * The best carrier id for a shipment: a real Fishbowl carrier name wins;
 * otherwise (RATESHOP and friends) detect it from the tracking number. Returns
 * null when neither yields a carrier we can link.
 */
export function resolveCarrier(
  fishbowlName?: string | null,
  trackingNum?: string | null
): CarrierId | null {
  return fishbowlCarrierId(fishbowlName) ?? detectCarrier(trackingNum);
}
